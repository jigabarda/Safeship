-- Explicit, repo-scoped ignore rules (the baseline). A rule is what makes a
-- dismissal persist across future scans; revoking one brings the finding back.
CREATE TABLE IF NOT EXISTS "IgnoreRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "title" TEXT,
    "severity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IgnoreRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IgnoreRule_userId_repoFullName_engine_ruleId_filePath_key" ON "IgnoreRule"("userId", "repoFullName", "engine", "ruleId", "filePath");
CREATE INDEX IF NOT EXISTS "IgnoreRule_userId_repoFullName_idx" ON "IgnoreRule"("userId", "repoFullName");
DO $$ BEGIN
  ALTER TABLE "IgnoreRule" ADD CONSTRAINT "IgnoreRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Backfill: every finding the user has already dismissed becomes an explicit
-- rule, so existing baselines survive this change.
INSERT INTO "IgnoreRule" ("id", "userId", "repoFullName", "engine", "ruleId", "filePath", "reason", "title", "severity", "createdAt")
SELECT DISTINCT ON (s."userId", s."repoFullName", f."engine", f."ruleId", COALESCE(f."filePath", ''))
       gen_random_uuid()::text,
       s."userId",
       s."repoFullName",
       f."engine",
       f."ruleId",
       COALESCE(f."filePath", ''),
       COALESCE(f."dismissReason", 'false_positive'),
       f."title",
       f."severity",
       COALESCE(f."dismissedAt", CURRENT_TIMESTAMP)
FROM "Finding" f
JOIN "Scan" s ON s."id" = f."scanId"
WHERE f."dismissed" = true
ORDER BY s."userId", s."repoFullName", f."engine", f."ruleId", COALESCE(f."filePath", ''), f."dismissedAt" DESC
ON CONFLICT DO NOTHING;
