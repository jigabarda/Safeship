import { resolveBinary, runCli } from "./exec";
import type { EngineName } from "./types";

export interface EngineAvailability {
  engine: EngineName;
  label: string;
  available: boolean;
  purpose: string;
  installHint: string;
}

const CHECKS: Array<{
  engine: EngineName;
  label: string;
  command: string;
  envVar: string;
  args: string[];
  purpose: string;
  installHint: string;
}> = [
  {
    engine: "gitleaks",
    label: "gitleaks",
    command: "gitleaks",
    envVar: "GITLEAKS_PATH",
    args: ["version"],
    purpose: "finds leaked secrets & API keys",
    installHint:
      "Install from github.com/gitleaks/gitleaks/releases (or `brew install gitleaks`), then add it to PATH or set GITLEAKS_PATH.",
  },
  {
    engine: "osv",
    label: "osv-scanner",
    command: "osv-scanner",
    envVar: "OSV_SCANNER_PATH",
    args: ["--version"],
    purpose: "finds vulnerable dependencies",
    installHint:
      "Install from github.com/google/osv-scanner/releases (or `brew install osv-scanner`), then add it to PATH or set OSV_SCANNER_PATH.",
  },
  {
    engine: "semgrep",
    label: "semgrep",
    command: "semgrep",
    envVar: "SEMGREP_PATH",
    args: ["--version"],
    purpose: "finds insecure code patterns",
    installHint:
      "Install with `pip install semgrep`. No native Windows build — use WSL/Docker on Windows, or run on Linux/macOS.",
  },
];

/** Probe each engine binary (fast, short timeout). Never throws. */
export async function checkEngines(): Promise<EngineAvailability[]> {
  return Promise.all(
    CHECKS.map(async (c) => {
      const binary = resolveBinary(c.command, c.envVar);
      const res = await runCli(binary, c.args, { timeoutMs: 8000 });
      return {
        engine: c.engine,
        label: c.label,
        available: !res.missing,
        purpose: c.purpose,
        installHint: c.installHint,
      };
    }),
  );
}
