export const REDACTION = "<REDACTED_SECRET>";

// Patterns for common credential shapes. Kept deliberately conservative so we
// don't mangle ordinary code — the primary defense is redacting the *known*
// secret value that gitleaks already extracted; these are a safety net.
const PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /xox[baprs]-[0-9A-Za-z-]{10,}/g, // Slack tokens
  /gh[pousr]_[0-9A-Za-z]{20,}/g, // GitHub tokens
  /AIza[0-9A-Za-z\-_]{35}/g, // Google API key
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g, // PEM keys
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redact any known secret values and common credential patterns from a string.
 * Returns the scrubbed text and whether anything was redacted.
 */
export function redactText(
  text: string,
  knownSecrets: string[] = [],
): { text: string; redacted: boolean } {
  let out = text;
  let redacted = false;

  for (const secret of knownSecrets) {
    if (!secret || secret.length < 4) continue;
    const re = new RegExp(escapeRegExp(secret), "g");
    if (re.test(out)) {
      out = out.replace(re, REDACTION);
      redacted = true;
    }
  }

  for (const pattern of PATTERNS) {
    if (pattern.test(out)) {
      out = out.replace(pattern, REDACTION);
      redacted = true;
    }
    pattern.lastIndex = 0; // reset stateful global regex
  }

  return { text: out, redacted };
}

/** Convenience for redacting a lone secret value (e.g. for a title). */
export function redactSecret(): string {
  return REDACTION;
}
