"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What's the difference between a secret leak and a vulnerable dependency?",
  "How do I safely store API keys in a Next.js app?",
  "Explain SQL injection in simple terms.",
];

/**
 * A lightweight AI chat terminal. Stateless on the server — the whole
 * conversation is sent each turn. When `scanId` is provided the backend grounds
 * answers in that scan's findings.
 */
export function AssistantChat({
  scanId,
  placeholder = "Ask about security, a finding, or your code…",
}: {
  scanId?: string;
  placeholder?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, scanId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
    } catch {
      setError("Could not reach the assistant. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {/* Terminal-style title bar */}
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
            {sending && <TypingIndicator />}
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
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <RichText text={message.content} />
        )}
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
