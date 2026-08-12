-- Repos the user wants auto-rescanned on a schedule.
CREATE TABLE IF NOT EXISTS "WatchedRepo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedRepo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WatchedRepo_userId_repoFullName_key" ON "WatchedRepo"("userId", "repoFullName");
CREATE INDEX IF NOT EXISTS "WatchedRepo_userId_idx" ON "WatchedRepo"("userId");
DO $$ BEGIN
  ALTER TABLE "WatchedRepo" ADD CONSTRAINT "WatchedRepo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
