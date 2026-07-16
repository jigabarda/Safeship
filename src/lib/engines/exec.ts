import { execFile } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** true when the binary itself could not be found (ENOENT). */
  missing: boolean;
  /** true when the run exceeded the timeout and was killed. */
  timedOut: boolean;
}

/**
 * Resolve the binary to invoke for an engine. Honors an explicit env override
 * (e.g. GITLEAKS_PATH) and otherwise falls back to the command name on PATH.
 */
export function resolveBinary(commandName: string, envVar: string): string {
  const override = process.env[envVar]?.trim();
  return override && override.length > 0 ? override : commandName;
}

/**
 * Run a CLI tool without throwing. A non-zero exit code is NOT an error here —
 * most scanners exit non-zero simply because they found something. Callers
 * decide what a given code means. Only a missing binary or timeout is special.
 */
export function runCli(
  binary: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      {
        cwd: opts.cwd,
        timeout: timeoutMs,
        // Scanner JSON can be large; allow up to 64 MB before truncating.
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const err = error as
          | (NodeJS.ErrnoException & {
              killed?: boolean;
              code?: number | string;
              signal?: string;
            })
          | null;
        const missing = err?.code === "ENOENT";
        const timedOut = err?.killed === true || err?.signal === "SIGTERM";
        // execFile puts the numeric exit code on error.code when it's a number;
        // when the process exits 0, error is null.
        let code: number | null = 0;
        if (err) {
          code = typeof err.code === "number" ? err.code : null;
        }
        resolve({
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          code,
          missing,
          timedOut,
        });
      },
    );
  });
}
