import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  createBranch,
  createFile,
  findOpenPrByHead,
  getDefaultBranch,
  getFileContent,
  GitHubApiError,
  openPullRequest,
  putFile,
} from "@/lib/github/repoFiles";
import { parseStructureTree, treeToAscii } from "@/lib/advisor/structureTree";

// Apply a Structure review as a SAFE pull request: it adds a STRUCTURE.md that
// documents the recommended layout + migration steps. It never moves or renames
// files, so nothing in the user's build can break.

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

interface Body {
  repoFullName?: string;
  markdown?: string;
  tree?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const repoFullName = body.repoFullName?.trim();
  if (!repoFullName || !/^[^/\s]+\/[^/\s]+$/.test(repoFullName)) {
    return Response.json({ error: "A valid repo (owner/name) is required." }, { status: 400 });
  }
  const markdown = (body.markdown ?? "").trim().slice(0, 12_000);
  const tree = parseStructureTree(body.tree);
  if (!tree) {
    return Response.json({ error: "No recommended structure to apply." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file — please sign in again." }, { status: 401 });
  }
  const token = user.accessToken;

  const content = [
    "# Recommended project structure",
    "",
    "> Proposed by **Safeship**. This documents a cleaner layout and how to get there — it does **not** move or rename any of your files.",
    "",
    "## Target structure",
    "",
    "```",
    treeToAscii(tree),
    "```",
    "",
    markdown || "_See the recommended structure above._",
    "",
  ].join("\n");

  try {
    const base = await getDefaultBranch(repoFullName, token);
    const branch = `safeship/structure-${timestamp(new Date())}`;
    await createBranch(repoFullName, base, branch, token);

    const path = "STRUCTURE.md";
    const message = "Document recommended project structure";
    const existing = await getFileContent(repoFullName, path, token, base);
    if (existing) {
      await putFile(repoFullName, path, content, message, branch, existing.sha, token);
    } else {
      await createFile(repoFullName, path, content, message, branch, token);
    }

    const prTitle = "Document a cleaner project structure";
    const prBody = [
      "Adds **`STRUCTURE.md`** with a recommended folder structure and migration steps, proposed by **Safeship**.",
      "",
      "This is documentation only — no files were moved or renamed, so nothing in your build changes. Follow the steps at your own pace.",
    ].join("\n");

    try {
      const pr = await openPullRequest(repoFullName, branch, base, prTitle, prBody, token);
      return Response.json({
        applied: true,
        prUrl: pr.htmlUrl,
        prNumber: pr.number,
        summary: "recommended structure",
        changeKind: existing ? "edit" : "create",
        path,
      });
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 422) {
        const open = await findOpenPrByHead(repoFullName, branch, token);
        if (open) {
          return Response.json({
            applied: true,
            alreadyOpen: true,
            prUrl: open.htmlUrl,
            prNumber: open.number,
            summary: "recommended structure",
            changeKind: existing ? "edit" : "create",
            path,
          });
        }
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof GitHubApiError) {
      const msg =
        e.status === 403
          ? "GitHub refused the change — your access may not allow opening pull requests on this repo."
          : `GitHub error (${e.status}). Please try again.`;
      return Response.json({ error: msg }, { status: 502 });
    }
    console.warn(`[apply-structure] failed: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't open a structure PR. Please try again." }, { status: 502 });
  }
}
