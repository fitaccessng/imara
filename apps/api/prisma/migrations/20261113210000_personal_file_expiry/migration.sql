ALTER TABLE "StoredFile"
ADD COLUMN "expiryDate" DATE;

CREATE INDEX "StoredFile_userId_workspaceId_eventId_fileRequestId_status_deletedAt_expiryDate_idx"
ON "StoredFile"("userId", "workspaceId", "eventId", "fileRequestId", "status", "deletedAt", "expiryDate");
