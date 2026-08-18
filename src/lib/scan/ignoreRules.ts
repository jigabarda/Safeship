import { db } from "@/lib/db";
import { dismissalKey } from "./dismissals";

// Ignore rules are the *baseline*: an explicit, repo-scoped decision that a
// class of finding (engine + ruleId + filePath) is a false positive, an accepted
// risk, or won't be fixed. Dismissing a finding writes a rule; restoring it
// deletes the rule. New scans consult these rules, which is what makes a
// dismissal stick — and what makes revoking one bring the finding back.

export const IGNORE_REASONS = ["false_positive", "accepted_risk", "wont_fix"] as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[number];

export function isIgnoreReason(value: unknown): value is IgnoreReason {
  return typeof value === "string" && (IGNORE_REASONS as readonly string[]).includes(value);
}

/** Findings carry a nullable filePath; rules store "" so the unique index works. */
function normalizePath(filePath: string | null | undefined): string {
  return filePath ?? "";
}

export interface RuleTarget {
  userId: string;
  repoFullName: string;
  engine: string;
  ruleId: string;
  filePath: string | null;
}

/** Every ignore rule for a repo, keyed for lookup against a finding. */
export async function ignoreRulesForRepo(
  userId: string,
  repoFullName: string,
): Promise<Map<string, IgnoreReason>> {
  const rules = await db.ignoreRule.findMany({
    where: { userId, repoFullName },
    select: { engine: true, ruleId: true, filePath: true, reason: true },
  });

  const map = new Map<string, IgnoreReason>();
  for (const r of rules) {
    const reason = isIgnoreReason(r.reason) ? r.reason : "false_positive";
    map.set(dismissalKey(r.engine, r.ruleId, r.filePath), reason);
  }
  return map;
}

/** The rules that apply to the repo a given scan belongs to. */
export async function ignoreRulesForScan(scanId: string): Promise<Map<string, IgnoreReason>> {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: { userId: true, repoFullName: true },
  });
  if (!scan) return new Map();
  return ignoreRulesForRepo(scan.userId, scan.repoFullName);
}

/** Create or update the rule behind a dismissal. */
export async function addIgnoreRule(
  target: RuleTarget,
  reason: IgnoreReason,
  meta: { title?: string | null; severity?: string | null } = {},
): Promise<void> {
  const filePath = normalizePath(target.filePath);
  await db.ignoreRule.upsert({
    where: {
      userId_repoFullName_engine_ruleId_filePath: {
        userId: target.userId,
        repoFullName: target.repoFullName,
        engine: target.engine,
        ruleId: target.ruleId,
        filePath,
      },
    },
    create: {
      userId: target.userId,
      repoFullName: target.repoFullName,
      engine: target.engine,
      ruleId: target.ruleId,
      filePath,
      reason,
      title: meta.title ?? null,
      severity: meta.severity ?? null,
    },
    update: {
      reason,
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.severity ? { severity: meta.severity } : {}),
    },
  });
}

/** Drop the rule so the finding is reported again from the next scan on. */
export async function removeIgnoreRule(target: RuleTarget): Promise<void> {
  await db.ignoreRule.deleteMany({
    where: {
      userId: target.userId,
      repoFullName: target.repoFullName,
      engine: target.engine,
      ruleId: target.ruleId,
      filePath: normalizePath(target.filePath),
    },
  });
}

/**
 * Apply a rule change to findings already stored for the repo, so the decision
 * is reflected on every scan report — not just the one the user clicked on.
 */
export async function syncFindingsToRule(
  target: RuleTarget,
  dismissed: boolean,
  reason: IgnoreReason | null,
): Promise<void> {
  await db.finding.updateMany({
    where: {
      engine: target.engine,
      ruleId: target.ruleId,
      filePath: target.filePath,
      scan: { userId: target.userId, repoFullName: target.repoFullName },
    },
    data: {
      dismissed,
      dismissReason: dismissed ? reason : null,
      dismissedAt: dismissed ? new Date() : null,
    },
  });
}
