// The engine half of a scan, extracted from runScan so it can run in two places:
//   1) in-process (the current local pipeline calls it), and
//   2) standalone on a GitHub Actions runner (see scanner/run.ts) — Phase C.
//
// It does everything that needs BINARIES + DISK + a CLONE, and nothing that
// needs the database or the LLM. Its output is fully REDACTED and safe to
// serialize / transmit: no secret values ever leave this module.

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { runAllEngines } from "../engines/index";
import type { EngineName, NormalizedFinding, Severity } from "../engines/types";
import { redactText } from "../llm/index";

const DEFAULT_ENGINE_TIMEOUT_MS = Number(
  process.env.SCAN_ENGINE_TIMEOUT_MS ?? 120_000,
);

/**
 * A finding after redaction and path-relativization. This is the ONLY finding
 * shape that leaves this module — it never carries `secretValue`, and its
 * `title`/`rawMessage` have had known secrets + credential patterns scrubbed.
 */
export interface RedactedFinding {
  engine: EngineName;
  ruleId: string;
  severity: Severity;
  /** Redacted, engine-derived title. */
  title: string;
  /** Path relative to the scan workdir (or null). */
  filePath: string | null;
  line: number | null;
  /** Redacted original engine message. */
  rawMessage: string;
  /** true if a secret value or credential pattern was scrubbed. */
  redacted: boolean;
}

/** Per-engine metadata (availability / errors) for banners and diagnostics. */
export interface EngineMeta {
  engine: EngineName;
  available: boolean;
  error?: string;
  durationMs: number;
  findingCount: number;
}

export interface EngineScanResult {
  findings: RedactedFinding[];
  engines: EngineMeta[];
  /** Engines whose binary was not installed. */
  missing: string[];
}

export interface EngineScanOptions {
  /** HTTPS repo URL to shallow-clone (omit when using sourceDirOverride). */
  repoUrl?: string;
  /** GitHub token for private repos. Omit/empty for public repos. */
  token?: string;
  /**
   * Test/local hook: scan a copy of this directory instead of cloning. The
   * directory is copied into a throwaway workdir which is deleted afterward
   * (the original is never touched).
   */
  sourceDirOverride?: string;
  /** Per-engine timeout. Defaults to SCAN_ENGINE_TIMEOUT_MS or 120s. */
  timeoutMs?: number;
}

/**
 * Get the code onto disk, run every engine, redact, and return safe findings.
 * ALWAYS deletes the working copy of the code (try/finally), even on failure.
 */
export async function runEngineScan(
  opts: EngineScanOptions,
): Promise<EngineScanResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS;
  const workdir = await mkdtemp(join(tmpdir(), "safeship-scan-"));

  try {
    // 1) Get the code onto disk.
    if (opts.sourceDirOverride) {
      await cp(opts.sourceDirOverride, workdir, { recursive: true });
    } else {
      if (!opts.repoUrl) {
        throw new Error("runEngineScan requires repoUrl or sourceDirOverride");
      }
      await cloneRepo(opts.repoUrl, opts.token, workdir);
    }

    // 2) Run engines.
    const { results, missing } = await runAllEngines(workdir, timeoutMs);

    // 3) Redact every finding BEFORE it leaves this module.
    const findings: RedactedFinding[] = [];
    for (const r of results) {
      for (const f of r.findings) {
        findings.push(redactFinding(f, workdir));
      }
    }

    const engines: EngineMeta[] = results.map((r) => ({
      engine: r.engine,
      available: r.available,
      error: r.error,
      durationMs: r.durationMs,
      findingCount: r.findings.length,
    }));

    return { findings, engines, missing };
  } finally {
    // ALWAYS delete the working copy of the code.
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Redact a raw finding and strip its secret value; relativize its path. */
function redactFinding(
  finding: NormalizedFinding,
  workdir: string,
): RedactedFinding {
  const knownSecrets = finding.secretValue ? [finding.secretValue] : [];
  const redactedMessage = redactText(finding.rawMessage, knownSecrets);
  const redactedTitle = redactText(finding.title, knownSecrets);
  const wasRedacted =
    redactedMessage.redacted || redactedTitle.redacted || !!finding.secretValue;

  return {
    engine: finding.engine,
    ruleId: finding.ruleId,
    severity: finding.severity,
    title: redactedTitle.text,
    filePath: relativizePath(finding.filePath, workdir),
    line: finding.line ?? null,
    rawMessage: redactedMessage.text,
    redacted: wasRedacted,
  };
}

async function cloneRepo(repoUrl: string, token: string | undefined, dest: string) {
  // With a token, authenticate the clone (needed for private repos). Without
  // one, clone the URL as-is (public repos need no auth).
  const url =
    token && token.length > 0
      ? repoUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`)
      : repoUrl;
  const git = simpleGit();
  await git.clone(url, dest, ["--depth", "1"]);
}

/** Make engine file paths relative to the scan workdir for display. */
function relativizePath(p: string | undefined, workdir: string): string | null {
  if (!p) return null;
  const normalized = p.replace(/\\/g, "/");
  const base = workdir.replace(/\\/g, "/");
  if (normalized.startsWith(base)) {
    return normalized.slice(base.length).replace(/^\/+/, "");
  }
  return normalized;
}
