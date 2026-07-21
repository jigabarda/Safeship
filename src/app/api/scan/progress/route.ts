import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { recordScanStep } from "@/lib/scan/recordStep";
import { isScanStepKey } from "@/lib/scan/steps";

// Receives step-progress pings from the GitHub Actions runner so the report page
// can show real progress instead of a guess. Same shared-secret auth as the
// findings callback. Carries no scan data — just "which step am I on".

const payloadSchema = z.object({
  scanId: z.string().min(1),
  step: z.string().refine(isScanStepKey, "unknown step"),
});

/** Constant-time secret comparison. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.SCAN_CALLBACK_SECRET;
  if (!secret) {
    console.error("[progress] SCAN_CALLBACK_SECRET not configured");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided = request.headers.get("x-safeship-secret") ?? "";
  if (!secretMatches(provided, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = payloadSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Safe to assert: the schema already validated it against the known keys.
  await recordScanStep(parsed.scanId, parsed.step as Parameters<typeof recordScanStep>[1]);
  return Response.json({ ok: true, step: parsed.step });
}
