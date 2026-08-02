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
import { getUserLlmClient } from "@/lib/llm/userClient";
import { LlmRateLimitError } from "@/lib/llm/types";
import { collectSchemaFiles } from "@/lib/advisor/analyze";
import { parseSchema } from "@/lib/schema/parse";
import {
  frameworkFromSource,
  FRAMEWORK_LABEL,
  planSchemaChange,
} from "@/lib/advisor/applySchema";

// Apply the Schema review's recommendations as ONE reviewable pull request, the
// correct way for the repo's framework (edit schema.prisma / .sql, or add a new
// Rails migration). Never touches a database; never auto-merges.

const MAX_RECOMMENDATIONS = 8_000;

interface Body {
  repoFullName?: string;
  recommendations?: string;
}

/** UTC timestamp for a Rails migration filename: YYYYMMDDHHMMSS. */
function railsTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function slugify(s: string): string {
  const base = s.split("/").pop() ?? s;
  return (
    base
      .toLowerCase()
      .replace(/\.rb$/i, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "schema_change"
  );
}

function primarySchemaFile(
  files: Array<{ path: string }>,
  ext: RegExp,
  preferred: string[],
): string | null {
  const matches = files.filter((f) => ext.test(f.path));
  if (matches.length === 0) return null;
  const byName = matches.find((f) => preferred.includes((f.path.split("/").pop() ?? "").toLowerCase()));
  return (byName ?? matches[0]).path;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

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
  const recommendations = (body.recommendations ?? "").trim().slice(0, MAX_RECOMMENDATIONS);
  if (!recommendations) {
    return Response.json({ error: "Run a schema review first, then apply it." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file — please sign in again." }, { status: 401 });
  }
  const token = user.accessToken;

  const llm = await getUserLlmClient(session.user.id, "fix");
  if (!llm) {
    return Response.json({ error: "The AI isn't configured to apply changes right now." }, { status: 503 });
  }

  try {
    const bundle = await collectSchemaFiles(repoFullName, token);
    if (!bundle) {
      return Response.json(
        { error: "No schema or database files found to change." },
        { status: 422 },
      );
    }

    const model = parseSchema(bundle.files);
    const framework = frameworkFromSource(model.source);

    const plan = await planSchemaChange(llm, framework, bundle.files, recommendations);
    if (!plan.canApply) {
      return Response.json({
        applied: false,
        note:
          plan.note ||
          "The AI couldn't turn these recommendations into a single safe change. They may need multiple steps or manual work.",
      });
    }

    // Resolve the concrete file to commit, framework-correctly.
    let commitPath: string;
    let isCreate: boolean;
    let editSha: string | undefined;

    if (framework === "prisma" || framework === "sql") {
      const target =
        framework === "prisma"
          ? primarySchemaFile(bundle.files, /\.prisma$/i, ["schema.prisma"])
          : primarySchemaFile(bundle.files, /\.sql$/i, ["schema.sql", "structure.sql"]);
      if (!target) {
        return Response.json({ error: "Couldn't locate the schema file to edit." }, { status: 422 });
      }
      const file = await getFileContent(repoFullName, target, token);
      if (!file) {
        return Response.json({ error: "Couldn't read the schema file to edit." }, { status: 404 });
      }
      // Guard against a truncated rewrite.
      if (plan.content.length < file.content.length * 0.4) {
        return Response.json({
          applied: false,
          note: "The AI's edited schema looked incomplete, so nothing was committed. Try again.",
        });
      }
      commitPath = target;
      editSha = file.sha;
      isCreate = false;
    } else if (framework === "rails") {
      const ts = railsTimestamp(new Date());
      commitPath = `db/migrate/${ts}_${slugify(plan.path || plan.summary)}.rb`;
      isCreate = true;
    } else {
      // Unknown stack — trust the AI's target, with the PR labeled best-effort.
      if (plan.changeKind === "edit") {
        const file = await getFileContent(repoFullName, plan.path, token);
        if (!file) {
          return Response.json(
            { applied: false, note: `The AI targeted a file that couldn't be read: ${plan.path}` },
          );
        }
        commitPath = plan.path;
        editSha = file.sha;
        isCreate = false;
      } else {
        commitPath = plan.path;
        isCreate = true;
      }
    }

    const base = await getDefaultBranch(repoFullName, token);
    const branch = `safeship/schema-${railsTimestamp(new Date())}`;
    await createBranch(repoFullName, base, branch, token);

    const commitMessage = `Improve schema: ${plan.summary || commitPath}`.slice(0, 100);
    if (isCreate) {
      await createFile(repoFullName, commitPath, plan.content, commitMessage, branch, token);
    } else {
      await putFile(repoFullName, commitPath, plan.content, commitMessage, branch, editSha!, token);
    }

    const bestEffort = framework === "unknown";
    const prTitle = `Improve schema (${FRAMEWORK_LABEL[framework]})`.slice(0, 120);
    const prBody = [
      `Schema improvement proposed by **Safeship**, applied the ${FRAMEWORK_LABEL[framework]} way (${isCreate ? "new migration" : "schema edit"}).`,
      ``,
      `**File:** \`${commitPath}\``,
      ``,
      `**What changed:** ${plan.summary || "See the diff."}`,
      plan.note ? `\n**Notes:** ${plan.note}` : "",
      bestEffort
        ? `\n> ⚠️ Safeship didn't recognize this framework, so double-check the file location and migration convention.`
        : "",
      ``,
      `> This change was generated by AI from a schema review. Review the diff before merging — it was not applied to any database.`,
    ]
      .filter(Boolean)
      .join("\n");

    let pr;
    try {
      pr = await openPullRequest(repoFullName, branch, base, prTitle, prBody, token);
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 422) {
        const existing = await findOpenPrByHead(repoFullName, branch, token);
        if (existing) {
          return Response.json({
            applied: true,
            alreadyOpen: true,
            prUrl: existing.htmlUrl,
            prNumber: existing.number,
            summary: plan.summary,
            changeKind: isCreate ? "create" : "edit",
            path: commitPath,
            framework,
          });
        }
      }
      throw e;
    }

    return Response.json({
      applied: true,
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      summary: plan.summary,
      changeKind: isCreate ? "create" : "edit",
      path: commitPath,
      framework,
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
    console.warn(`[apply-schema] failed: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't open a schema PR. Please try again." }, { status: 502 });
  }
}
