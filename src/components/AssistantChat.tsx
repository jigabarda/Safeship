"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const SUGGESTIONS = [
  "What's the difference between a secret leak and a vulnerable dependency?",
  "How do I safely store API keys in a Next.js app?",
  "Explain SQL injection in simple terms.",
];

/**
 * AI chat terminal with streaming replies and saved history. The whole
 * conversation is sent each turn; the server streams tokens back and persists
 * both sides, so past chats can be reopened from the sidebar.
 */
export function AssistantChat({
  scanId,
  conversations = [],
  placeholder = "Ask about security, a finding, or your code…",
}: {
  scanId?: string;
  conversations?: ConversationSummary[];
  placeholder?: string;
}) {
  const [convos, setConvos] = useState<ConversationSummary[]>(conversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setInput("");
  }

  async function openConversation(id: string) {
    if (id === activeId || sending) return;
    setError(null);
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`);
      if (!res.ok) {
        setError("Couldn't load that conversation.");
        return;
      }
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
      setActiveId(id);
    } catch {
      setError("Couldn't load that conversation.");
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConvos((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) newChat();
    try {
      await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
    } catch {
      /* it's already gone from the UI */
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);

    const base: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...base, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, messages: base, scanId }),
      });

      const convoId = res.headers.get("x-conversation-id");
      const titleHeader = res.headers.get("x-conversation-title");
      const title = titleHeader ? decodeURIComponent(titleHeader) : trimmed.slice(0, 60);

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        setMessages(base);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...base, { role: "assistant", content: acc }]);
      }

      if (convoId) {
        setActiveId(convoId);
        setConvos((prev) => [
          { id: convoId, title, updatedAt: new Date().toISOString() },
          ...prev.filter((c) => c.id !== convoId),
        ]);
      }
    } catch {
      setError("Could not reach the assistant. Check your connection.");
      setMessages(base);
    } finally {
      setSending(false);
    }
  }

  const empty = messages.length === 0;
  const waitingFirstToken =
    sending && messages.length > 0 && messages[messages.length - 1].content === "";

  return (
    <div className="grid min-h-[60vh] flex-1 grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]">
      {/* History sidebar */}
      <aside className="flex flex-col gap-2">
        <button
          onClick={newChat}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-surface-2"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New chat
        </button>
        {convos.length > 0 && (
          <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-lg border border-line bg-surface lg:max-h-none">
            {convos.map((c) => (
              <li key={c.id}>
                <div
                  onClick={() => openConversation(c.id)}
                  className={`group flex cursor-pointer items-center gap-2 border-b border-line/60 px-3 py-2 text-sm transition-colors last:border-0 ${
                    c.id === activeId ? "bg-surface-2" : "hover:bg-surface-2/50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <button
                    onClick={(e) => deleteConversation(c.id, e)}
                    aria-label="Delete conversation"
                    className="shrink-0 text-muted opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Chat */}
      <div className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-1 font-mono text-xs text-muted">safeship · assistant</span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          {empty ? (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
                  <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path
                    d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3v-3H6a2 2 0 01-2-2V6z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Ask the Safeship assistant</p>
                <p className="mt-1 text-sm text-muted">
                  Security questions, plain-English explanations, or help with your code.
                  It doesn&apos;t run anything — it just answers.
                </p>
              </div>
              <div className="flex flex-col gap-2 self-stretch">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:border-line-strong hover:bg-surface-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {waitingFirstToken && <TypingIndicator />}
            </div>
          )}
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-foreground text-background"
            : "border border-line bg-surface-2/50 text-foreground/90"
        }`}
      >
        {isUser ? <p className="whitespace-pre-wrap">{message.content}</p> : <RichText text={message.content} />}
      </div>
    </div>
  );
}

/** Minimal Markdown: fenced code blocks as <pre>, everything else pre-wrapped. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/```(?:[\w-]*\n)?/);
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-lg border border-line bg-background p-3 font-mono text-xs leading-relaxed"
          >
            {part.replace(/\n$/, "")}
          </pre>
        ) : (
          part.trim() && (
            <p key={i} className="whitespace-pre-wrap">
              {part.trim()}
            </p>
          )
        ),
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface-2/50 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
