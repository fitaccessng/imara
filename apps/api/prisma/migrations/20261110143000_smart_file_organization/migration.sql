CREATE TYPE "FileCategory" AS ENUM ('FINANCE', 'CONTRACTS', 'HUMAN_RESOURCES', 'OPERATIONS', 'PERSONAL', 'OTHER');

ALTER TABLE "StoredFile"
  ADD COLUMN "contentHash" CHAR(64),
  ADD COLUMN "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "StoredFile_userId_workspaceId_contentHash_status_idx"
  ON "StoredFile"("userId", "workspaceId", "contentHash", "status");
