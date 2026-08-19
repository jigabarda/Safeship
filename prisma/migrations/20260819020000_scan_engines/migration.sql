-- Which engines actually ran for a scan. Without this a silently missing engine
-- is indistinguishable from a clean repo: both produce no findings.
ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "engines" JSONB;
