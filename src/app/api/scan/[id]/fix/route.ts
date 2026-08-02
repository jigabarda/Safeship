import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  createBranch,
  getDefaultBranch,
  getFileContent,
  GitHubApiError,
  openPullRequest,
  putFile,
} from "@/lib/github/repoFiles";
import { getUserLlmClient } from "@/lib/llm/userClient";
import { LlmRateLimitError } from "@/lib/llm/types";
import {
  generateFileFix,
  isFixablePath,
  MAX_FIX_FILE_BYTES,
  type FixIssue,
} from "@/lib/fix/generate";

// Batch "Fix with AI": take a set of selected findings from ONE scan, fix them
// grouped by file (so several findings in the same file are resolved in a single
// pass), and open ONE pull request off the default branch with all the changes.
// Owner-only; uses the user's own GitHub token.

const MAX_BATCH = 15;

type ResultStatus = "fixed" | "skipped";
interface FindingResult {
  findingId: string;
  status: ResultStatus;
  note?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id: scanId } = await params;

  let body: { findingIds?: unknown };
  try {
    body = (await request.json()) as { findingIds?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestedIds = Array.isArray(body.findingIds)
    ? [...new Set(body.findingIds.filter((x): x is string => typeof x === "string"))]
    : [];
  if (requestedIds.length === 0) {
    return Response.json({ error: "Select at least one finding to fix." }, { status: 400 });
  }
  if (requestedIds.length > MAX_BATCH) {
    return Response.json(
      { error: `Please select ${MAX_BATCH} or fewer findings at a time.` },
      { status: 400 },
    );
  }

  const scan = await db.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.userId !== session.user.id) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file — please sign in again." }, { status: 401 });
  }
  const token = user.accessToken;
  const repo = scan.repoFullName;

  const llm = await getUserLlmClient(session.user.id);
  if (!llm) {
    return Response.json({ error: "The AI isn't configured to generate fixes right now." }, { status: 503 });
  }

  // Only findings that actually belong to this scan.
  const findings = await db.finding.findMany({
    where: { id: { in: requestedIds }, scanId },
  });

  const results: FindingResult[] = [];
  const byFile = new Map<string, typeof findings>();

  for (const f of findings) {
    if (!f.filePath) {
      results.push({ findingId: f.id, status: "skipped", note: "Not tied to a specific file." });
      continue;
    }
    if (!isFixablePath(f.filePath)) {
      results.push({ findingId: f.id, status: "skipped", note: "Generated lockfile — can't auto-fix." });
      continue;
    }
    const arr = byFile.get(f.filePath);
    if (arr) arr.push(f);
    else byFile.set(f.filePath, [f]);
  }
  // Anything requested that doesn't exist on this scan.
  for (const rid of requestedIds) {
    if (!findings.some((f) => f.id === rid)) {
      results.push({ findingId: rid, status: "skipped", note: "Finding not found." });
    }
  }

  try {
    // Phase 1: read + generate a fix per file (no writes yet, so a total failure
    // leaves no empty branch behind).
    const staged: Array<{
      path: string;
      content: string;
      sha: string;
      summary: string;
      findingIds: string[];
    }> = [];

    for (const [path, group] of byFile) {
      const file = await getFileContent(repo, path, token);
      if (!file) {
        for (const f of group)
          results.push({ findingId: f.id, status: "skipped", note: "File couldn't be read." });
        continue;
      }
      if (file.content.length > MAX_FIX_FILE_BYTES) {
        for (const f of group)
          results.push({ findingId: f.id, status: "skipped", note: "File too large to auto-fix." });
        continue;
      }

      const issues: FixIssue[] = group.map((f) => ({
        engine: f.engine,
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        rawMessage: f.rawMessage,
        line: f.line,
      }));
      const fix = await generateFileFix(llm, path, file.content, issues);

      if (fix.canFix) {
        staged.push({
          path,
          content: fix.fixedContent,
          sha: file.sha,
          summary: fix.summary,
          findingIds: group.map((f) => f.id),
        });
      } else {
        const note = fix.summary || "The AI couldn't produce a safe fix for this file.";
        for (const f of group) results.push({ findingId: f.id, status: "skipped", note });
      }
    }

    if (staged.length === 0) {
      return Response.json({
        fixed: false,
        note: "None of the selected findings could be auto-fixed. See the details below.",
        results,
      });
    }

    // Phase 2: one branch, one commit per file, one PR.
    const base = await getDefaultBranch(repo, token);
    const suffix = globalThis.crypto.randomUUID().slice(0, 8);
    const branch = `safeship/fixes-${suffix}`;
    await createBranch(repo, base, branch, token);

    const fixedFindingIds: string[] = [];
    for (const s of staged) {
      await putFile(
        repo,
        s.path,
        s.content,
        `Fix ${s.findingIds.length} issue${s.findingIds.length === 1 ? "" : "s"} in ${s.path}`,
        branch,
        s.sha,
        token,
      );
      for (const fid of s.findingIds) {
        results.push({ findingId: fid, status: "fixed" });
        fixedFindingIds.push(fid);
      }
    }

    const title = `Fix ${fixedFindingIds.length} issue${fixedFindingIds.length === 1 ? "" : "s"} found by Safeship`.slice(0, 120);
    const body = [
      `Automated fixes proposed by **Safeship** for ${fixedFindingIds.length} finding${fixedFindingIds.length === 1 ? "" : "s"} across ${staged.length} file${staged.length === 1 ? "" : "s"}.`,
      ``,
      ...staged.map((s) =>
        [`### \`${s.path}\``, s.summary || "See the diff.", ``].join("\n"),
      ),
      `> These changes were generated by AI. Please review the diff before merging.`,
    ].join("\n");

    const pr = await openPullRequest(repo, branch, base, title, body, token);

    return Response.json({
      fixed: true,
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      fixedCount: fixedFindingIds.length,
      fileCount: staged.length,
      results,
    });
  } catch (e) {
    if (e instanceof LlmRateLimitError) {
      return Response.json(
        { error: "The AI is busy right now (rate limit). Give it a moment and try again." },
        { status: 429 },
      );
    }
    if (e instanceof GitHubApiError) {
      const msg =
        e.status === 403
          ? "GitHub refused the change — your access may not allow opening pull requests on this repo."
          : `GitHub error (${e.status}). Please try again.`;
      return Response.json({ error: msg }, { status: 502 });
    }
    console.warn(`[batch-fix ${scanId}] failed: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't open a fix PR. Please try again." }, { status: 502 });
  }
}
