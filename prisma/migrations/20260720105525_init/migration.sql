-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "score" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filePath" TEXT,
    "line" INTEGER,
    "rawMessage" TEXT NOT NULL,
    "plainExplanation" TEXT,
    "suggestedFix" TEXT,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
