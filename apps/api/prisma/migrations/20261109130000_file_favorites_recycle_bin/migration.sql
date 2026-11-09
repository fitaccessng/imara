ALTER TABLE "StoredFile"
ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "StoredFile_userId_workspaceId_isFavorite_deletedAt_createdAt_idx"
ON "StoredFile"("userId", "workspaceId", "isFavorite", "deletedAt", "createdAt");

CREATE INDEX "StoredFile_userId_workspaceId_deletedAt_createdAt_idx"
ON "StoredFile"("userId", "workspaceId", "deletedAt", "createdAt");
