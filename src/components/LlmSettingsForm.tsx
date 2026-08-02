"use client";

import { useState } from "react";
import { LLM_PRESETS } from "@/lib/llm/providers";

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; keyMask: string }
  | { kind: "removed" }
  | { kind: "error"; message: string };

export function LlmSettingsForm({ initial }: { initial: LlmConfig | null }) {
  const initialPreset =
    LLM_PRESETS.find((p) => p.id === initial?.provider) ??
    (initial ? LLM_PRESETS.find((p) => p.id === "custom")! : LLM_PRESETS[0]);

  const [presetId, setPresetId] = useState(initialPreset.id);
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? initialPreset.baseUrl);
  const [model, setModel] = useState(initial?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const preset = LLM_PRESETS.find((p) => p.id === presetId)!;
  const isCustom = presetId === "custom";
  const saving = status.kind === "saving";

  function onPreset(id: string) {
    setPresetId(id);
    const p = LLM_PRESETS.find((x) => x.id === id)!;
    if (p.id !== "custom") setBaseUrl(p.baseUrl);
    else setBaseUrl("");
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: presetId, baseUrl, model, apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }
      setEnabled(true);
      setApiKey("");
      setStatus({ kind: "saved", keyMask: data.keyMask ?? "••••" });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server." });
    }
  }

  async function remove() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/llm", { method: "DELETE" });
      if (!res.ok) {
        setStatus({ kind: "error", message: "Couldn't remove the config." });
        return;
      }
      setEnabled(false);
      setModel("");
      setApiKey("");
      onPreset(LLM_PRESETS[0].id);
      setStatus({ kind: "removed" });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server." });
    }
  }

  const canSave = Boolean(baseUrl && model && (apiKey || (enabled && initial?.hasKey))) && !saving;

  return (
    <div className="flex flex-col gap-4">
      {enabled && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/25 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Using your own model — <span className="font-medium">{initial?.model ?? model}</span>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Provider</span>
        <select
          value={presetId}
          onChange={(e) => onPreset(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          {LLM_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {isCustom && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Model</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={preset.exampleModel || "model-name"}
          spellCheck={false}
          className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={initial?.hasKey ? "Key set — leave blank to keep it" : "sk-…"}
          spellCheck={false}
          autoComplete="off"
          className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <span className="text-xs text-muted">
          Stored encrypted and used only for your requests. It&apos;s never shown again.
        </span>
      </label>

      {status.kind === "error" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Saved and verified — key {status.keyMask}. Safeship now uses your model.
        </p>
      )}
      {status.kind === "removed" && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Removed — back to Safeship&apos;s built-in model.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {saving && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent" />
          )}
          {saving ? "Testing…" : "Save & test"}
        </button>
        {enabled && (
          <button
            onClick={remove}
            disabled={saving}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Use Safeship&apos;s default
          </button>
        )}
      </div>
    </div>
  );
}
