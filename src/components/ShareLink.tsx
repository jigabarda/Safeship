"use client";

import { useState } from "react";

// Create / copy / revoke a public read-only share link for a scan. Nothing is
// shared until the owner clicks Create; the link is revocable at any time.
export function ShareLink({
  scanId,
  initialToken,
}: {
  scanId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = token ? `${origin()}/share/${token}` : null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan/${scanId}/share`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setToken(body.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan/${scanId}/share`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setToken(null);
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={create}
          disabled={busy}
          className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium shadow-sm transition-all hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50 print:hidden"
        >
          {busy ? "Creating…" : "Create share link"}
        </button>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 print:hidden sm:items-end">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          className="w-64 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted outline-none"
        />
        <button
          onClick={copy}
          className="rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>Anyone with this link can view a read-only report.</span>
        <button
          onClick={revoke}
          disabled={busy}
          className="font-medium text-rose-600 underline underline-offset-2 hover:opacity-80 disabled:opacity-50 dark:text-rose-400"
        >
          {busy ? "Revoking…" : "Revoke"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

/** Safe on the client; empty string during SSR so markup matches until hydration. */
function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}
