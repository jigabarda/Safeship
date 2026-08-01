import { auth } from "@/auth";
import { db } from "@/lib/db";
import { GitHubApiError } from "@/lib/github/repoFiles";
import { collectSchemaFiles } from "@/lib/advisor/analyze";
import { parseSchema } from "@/lib/schema/parse";

// Build an ER diagram model for a repo's schema. Deterministic — no LLM, no
// tokens — so it's instant and free. Reads schema files with the user's token.

interface Body {
  repoFullName?: string;
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

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file — please sign in again." }, { status: 401 });
  }

  try {
    const collected = await collectSchemaFiles(repoFullName, user.accessToken);
    if (!collected) {
      return Response.json(
        { error: "No schema or database files found (looked for .prisma, .sql, migrations, and model folders)." },
        { status: 422 },
      );
    }

    const model = parseSchema(collected.files);
    if (model.tables.length === 0) {
      return Response.json(
        { error: "Found schema files, but couldn't extract any tables to diagram." },
        { status: 422 },
      );
    }

    return Response.json({
      repoFullName,
      model,
      filesConsidered: collected.files.map((f) => f.path),
      truncated: collected.truncated,
    });
  } catch (e) {
    if (e instanceof GitHubApiError) {
      const msg =
        e.status === 404
          ? "That repository couldn't be read. It may be empty or you may have lost access."
          : `GitHub error (${e.status}). Try signing out and back in.`;
      return Response.json({ error: msg }, { status: e.status === 404 ? 404 : 502 });
    }
    console.warn(`[schema-map] failed: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't build the schema diagram. Please try again." }, { status: 502 });
  }
}
