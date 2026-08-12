-- Opt-in read-only public sharing for a scan report.
ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Scan_shareToken_key" ON "Scan"("shareToken");
