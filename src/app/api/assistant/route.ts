import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getLlmClient } from "@/lib/llm/index";
import { LlmRateLimitError, type ChatMessage } from "@/lib/llm/types";

// Streaming chat endpoint for the in-app assistant. Persists each turn to a
// Conversation so history survives across sessions, and streams the reply token
// by token so it feels fast even on a slow local model. Owner-only.

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

const SYSTEM_PROMPT = `You are the Safeship assistant — a friendly, concrete helper for developers who are often NOT security experts (many build with AI tools).

You help with: understanding security findings, explaining concepts in plain language (define jargon like "CVE" or "SQL injection"), suggesting fixes, and general coding/architecture questions about the user's project.

Rules:
- Be concise and practical. Prefer short paragraphs, steps, and small code snippets.
- This is static analysis and advice — never claim anything was hacked or exploited.
- If you're unsure or lack context, say so plainly instead of inventing specifics.
- Never output real secret values.
- Use Markdown for formatting.`;

interface Body {
  conversationId?: string;
  messages?: Array<{ role?: string; content?: string }>;
  scanId?: string;
}

async function scanContext(scanId: string, userId: string): Promise<string | null> {
  const scan = await db.scan.findUnique({ where: { id: scanId }, include: { findings: true } });
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
  const userId = session.user.id;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const history: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is { role: string; content: string } =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, MAX_CHARS) }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json({ error: "Send a message to continue." }, { status: 400 });
  }

  const llm = getLlmClient();
  if (!llm) {
    return Response.json({ error: "The AI assistant isn't configured right now." }, { status: 503 });
  }

  // Resolve (or create) the conversation this turn belongs to.
  const lastUser = history[history.length - 1].content;
  let conversation = body.conversationId
    ? await db.conversation.findUnique({ where: { id: body.conversationId } })
    : null;
  if (conversation && conversation.userId !== userId) conversation = null;
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { userId, title: lastUser.slice(0, 60) || "New chat" },
    });
  }
  const conversation_ = conversation; // non-null for closures
  await db.chatMessage.create({
    data: { conversationId: conversation_.id, role: "user", content: lastUser },
  });

  let system = SYSTEM_PROMPT;
  if (body.scanId) {
    const ctx = await scanContext(body.scanId, userId);
    if (ctx) system += `\n\n---\nContext for this conversation:\n${ctx}`;
  }
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...history];
  const opts = { temperature: 0.4, maxTokens: 900 };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        if (llm.stream) {
          for await (const token of llm.stream(messages, opts)) {
            full += token;
            controller.enqueue(encoder.encode(token));
          }
        } else {
          full = await llm.complete(messages, opts);
          controller.enqueue(encoder.encode(full));
        }
      } catch (e) {
        const msg =
          e instanceof LlmRateLimitError
            ? "\n\n_(The AI is rate-limited right now — give it a moment and try again.)_"
            : "\n\n_(The assistant hit an error. Please try again.)_";
        controller.enqueue(encoder.encode(full ? msg : msg.trim()));
      }
      // Persist the reply BEFORE closing, so it survives a serverless freeze.
      if (full.trim()) {
        try {
          await db.chatMessage.create({
            data: { conversationId: conversation_.id, role: "assistant", content: full },
          });
          await db.conversation.update({
            where: { id: conversation_.id },
            data: { title: conversation_.title },
          });
        } catch {
          /* best-effort persistence */
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "x-conversation-id": conversation_.id,
      "x-conversation-title": encodeURIComponent(conversation_.title),
    },
  });
}
