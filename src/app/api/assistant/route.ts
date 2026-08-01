import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getLlmClient } from "@/lib/llm/index";
import { LlmRateLimitError, type ChatMessage } from "@/lib/llm/types";

// A small chat endpoint powering the in-app AI assistant. Stateless: the client
// sends the running conversation each turn. Optionally scoped to one scan, whose
// findings we summarize into the system prompt so answers are grounded in the
// user's actual results. Owner-only for any scan referenced.

const MAX_TURNS = 20; // keep the history (and token use) bounded
const MAX_CHARS = 4000; // per-message guardrail

const SYSTEM_PROMPT = `You are the Safeship assistant — a friendly, concrete helper for developers who are often NOT security experts (many build with AI tools).

You help with: understanding security findings, explaining concepts in plain language (define jargon like "CVE" or "SQL injection"), suggesting fixes, and general coding/architecture questions about the user's project.

Rules:
- Be concise and practical. Prefer short paragraphs, steps, and small code snippets.
- This is static analysis and advice — never claim anything was hacked or exploited.
- If you're unsure or lack context, say so plainly instead of inventing specifics.
- Never output real secret values.
- Use Markdown for formatting.`;

interface Body {
  messages?: Array<{ role?: string; content?: string }>;
  scanId?: string;
}

async function scanContext(scanId: string, userId: string): Promise<string | null> {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    include: { findings: true },
  });
  if (!scan || scan.userId !== userId) return null;

  const top = [...scan.findings]
    .slice(0, 25)
    .map((f) => `- [${f.severity}] ${f.title} (${f.engine}${f.filePath ? `, ${f.filePath}` : ""})`)
    .join("\n");

  return [
    `The user is asking about a specific scan.`,
    `Repository: ${scan.repoFullName}`,
    `Status: ${scan.status}${scan.score != null ? `, safety score ${scan.score}/100` : ""}`,
    scan.findings.length > 0 ? `Findings (${scan.findings.length} total, showing up to 25):\n${top}` : `No findings were reported.`,
  ].join("\n");
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

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const history: ChatMessage[] = incoming
    .filter(
      (m): m is { role: string; content: string } =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-MAX_TURNS)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, MAX_CHARS),
    }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json({ error: "Send a message to continue." }, { status: 400 });
  }

  const llm = getLlmClient();
  if (!llm) {
    return Response.json(
      { error: "The AI assistant isn't configured right now." },
      { status: 503 },
    );
  }

  let system = SYSTEM_PROMPT;
  if (body.scanId) {
    const ctx = await scanContext(body.scanId, session.user.id);
    if (ctx) system += `\n\n---\nContext for this conversation:\n${ctx}`;
  }

  try {
    const reply = await llm.complete(
      [{ role: "system", content: system }, ...history],
      { temperature: 0.4, maxTokens: 900 },
    );
    return Response.json({ reply });
  } catch (e) {
    if (e instanceof LlmRateLimitError) {
      return Response.json(
        { error: "The AI is busy right now (rate limit). Give it a moment and try again." },
        { status: 429 },
      );
    }
    console.warn(`[assistant] completion failed: ${(e as Error).message}`);
    return Response.json(
      { error: "The assistant hit an error. Please try again." },
      { status: 502 },
    );
  }
}
