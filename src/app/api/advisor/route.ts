import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { GitHubApiError } from "@/lib/github/repoFiles";
import { getUserLlmClient } from "@/lib/llm/userClient";
import { LlmRateLimitError } from "@/lib/llm/types";
import {
  ADVISOR_META,
  buildAdvisorMessages,
  collectContext,
  collectSchemaContext,
  isAdvisorTool,
  parseAdvisorResult,
} from "@/lib/advisor/analyze";
import type { SchemaModel } from "@/lib/schema/parse";

// Run one advisor tool (schema / stack / optimize) against a repo the signed-in
// user can access. Reads files via the GitHub API with the user's own token,
// then asks the LLM for a review. Stateless — nothing is persisted.

interface Body {
  repoFullName?: string;
  tool?: string;
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
  if (!body.tool || !isAdvisorTool(body.tool)) {
    return Response.json({ error: "Unknown advisor tool." }, { status: 400 });
  }
  const tool = body.tool;

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file — please sign in again." }, { status: 401 });
  }

  const llm = await getUserLlmClient(session.user.id);
  if (!llm) {
    return Response.json({ error: "The AI advisor isn't configured right now." }, { status: 503 });
  }

  try {
    // Schema review is unified: parse the schema for the visualizer AND send it
    // to the AI for suggestions, so users see the diagram and what to fix.
    let model: SchemaModel | undefined;
    let ctx;
    if (tool === "schema") {
      const bundle = await collectSchemaContext(repoFullName, user.accessToken);
      if (!bundle) {
        return Response.json({ error: ADVISOR_META.schema.emptyMessage }, { status: 422 });
      }
      ctx = bundle.ctx;
      model = bundle.model;
    } else {
      ctx = await collectContext(tool, repoFullName, user.accessToken);
      if (!ctx) {
        return Response.json({ error: ADVISOR_META[tool].emptyMessage }, { status: 422 });
      }
    }

    const raw = await llm.complete(buildAdvisorMessages(tool, ctx), {
      temperature: 0.3,
      json: true,
      maxTokens: 1500,
    });
    const result = parseAdvisorResult(raw);
    const filesConsidered = ctx.files.map((f) => f.path);

    // Save the review so it shows up in the user's recent activity.
    const run = await db.advisorRun.create({
      data: {
        userId: session.user.id,
        repoFullName,
        tool,
        rating: result.rating,
        headline: result.headline,
        markdown: result.markdown,
        model: model ? (model as unknown as Prisma.InputJsonValue) : undefined,
        filesConsidered: filesConsidered as unknown as Prisma.InputJsonValue,
      },
    });

    return Response.json({
      id: run.id,
      tool,
      repoFullName,
      rating: result.rating,
      headline: result.headline,
      markdown: result.markdown,
      model,
      filesConsidered,
      truncated: ctx.truncated,
      createdAt: run.createdAt.toISOString(),
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
        e.status === 404
          ? "That repository couldn't be read. It may be empty or you may have lost access."
          : `GitHub error (${e.status}). Try signing out and back in.`;
      return Response.json({ error: msg }, { status: e.status === 404 ? 404 : 502 });
    }
    console.warn(`[advisor:${tool}] failed: ${(e as Error).message}`);
    return Response.json({ error: "The advisor hit an error. Please try again." }, { status: 502 });
  }
}
