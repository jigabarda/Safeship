-- Model library
CREATE TABLE IF NOT EXISTS "LlmModel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LlmModel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LlmModel_userId_idx" ON "LlmModel"("userId");
ALTER TABLE "LlmModel" DROP CONSTRAINT IF EXISTS "LlmModel_userId_fkey";
ALTER TABLE "LlmModel" ADD CONSTRAINT "LlmModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-feature assignments (null = Safeship default)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "explainModelId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "advisorModelId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assistantModelId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fixModelId" TEXT;

-- Retire the old single-config columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "llmProvider";
ALTER TABLE "User" DROP COLUMN IF EXISTS "llmBaseUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "llmModel";
ALTER TABLE "User" DROP COLUMN IF EXISTS "llmApiKeyEnc";
