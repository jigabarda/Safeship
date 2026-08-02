"use client";

import { useState } from "react";
import { LLM_PRESETS } from "@/lib/llm/providers";
import { LLM_FEATURES, type LlmFeature } from "@/lib/llm/features";

export interface LlmModelDto {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  model: string;
}

export type Assignments = Record<LlmFeature, string | null>;

export function LlmSettingsForm({
  initialModels,
  initialAssignments,
}: {
  initialModels: LlmModelDto[];
  initialAssignments: Assignments;
}) {
  const [models, setModels] = useState<LlmModelDto[]>(initialModels);
  const [assignments, setAssignments] = useState<Assignments>(initialAssignments);
  const [adding, setAdding] = useState(false);

  async function saveAssignments(next: Assignments) {
    setAssignments(next);
    try {
      await fetch("/api/settings/llm/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {
      /* best-effort; the UI already reflects the choice */
    }
  }

  function setFeature(feature: LlmFeature, modelId: string | null) {
    saveAssignments({ ...assignments, [feature]: modelId });
  }

  function setAll(modelId: string | null) {
    const next = {} as Assignments;
    for (const f of LLM_FEATURES) next[f.key] = modelId;
    saveAssignments(next);
  }

  async function deleteModel(id: string) {
    setModels((prev) => prev.filter((m) => m.id !== id));
    const cleared = { ...assignments };
    for (const f of LLM_FEATURES) if (cleared[f.key] === id) cleared[f.key] = null;
    setAssignments(cleared);
    try {
      await fetch(`/api/settings/llm/models/${id}`, { method: "DELETE" });
    } catch {
      /* already removed from UI */
    }
  }

  const hasModels = models.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Model library */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your models</h3>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium transition-colors hover:bg-surface-2"
            >
              + Add model
            </button>
          )}
        </div>

        {hasModels ? (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line">
            {models.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.label}</p>
                  <p className="truncate font-mono text-xs text-muted">{m.model}</p>
                </div>
                <button
                  onClick={() => deleteModel(m.id)}
                  aria-label={`Delete ${m.label}`}
                  className="shrink-0 text-muted transition-colors hover:text-rose-500"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !adding && (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-sm text-muted">
              No models yet. Add one to use it below.
            </p>
          )
        )}

        {adding && (
          <AddModelForm
            onCancel={() => setAdding(false)}
            onAdded={(m) => {
              setModels((prev) => [...prev, m]);
              setAdding(false);
            }}
          />
        )}
      </div>

      {/* Per-feature assignment */}
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Which model each feature uses</h3>
          {hasModels && (
            <label className="flex items-center gap-2 text-xs text-muted">
              Set all to
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value === "__default") setAll(null);
                  else if (e.target.value) setAll(e.target.value);
                }}
                className="rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-brand"
              >
                <option value="">—</option>
                <option value="__default">Safeship default</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {LLM_FEATURES.map((f) => (
            <div
              key={f.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted">{f.desc}</p>
              </div>
              <select
                value={assignments[f.key] ?? "__default"}
                onChange={(e) =>
                  setFeature(f.key, e.target.value === "__default" ? null : e.target.value)
                }
                disabled={!hasModels}
                className="shrink-0 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
              >
                <option value="__default">Safeship default</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {!hasModels && (
          <p className="text-xs text-muted">Add a model above to assign it to a feature.</p>
        )}
      </div>
    </div>
  );
}

function AddModelForm({
  onAdded,
  onCancel,
}: {
  onAdded: (m: LlmModelDto) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [presetId, setPresetId] = useState(LLM_PRESETS[0].id);
  const [baseUrl, setBaseUrl] = useState(LLM_PRESETS[0].baseUrl);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = LLM_PRESETS.find((p) => p.id === presetId)!;
  const isCustom = presetId === "custom";

  function onPreset(id: string) {
    setPresetId(id);
    const p = LLM_PRESETS.find((x) => x.id === id)!;
    setBaseUrl(p.id === "custom" ? "" : p.baseUrl);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, provider: presetId, baseUrl, model, apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      onAdded(data.model as LlmModelDto);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(label && baseUrl && model && apiKey) && !saving;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Name</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My OpenAI"
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Provider</span>
          <select
            value={presetId}
            onChange={(e) => onPreset(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {LLM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isCustom && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Model</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={preset.exampleModel || "model-name"}
          spellCheck={false}
          className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…"
          spellCheck={false}
          autoComplete="off"
          className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <span className="text-xs text-muted">Stored encrypted; used only for your requests.</span>
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
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
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
