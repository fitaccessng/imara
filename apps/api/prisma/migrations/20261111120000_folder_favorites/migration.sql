ALTER TABLE "Folder"
ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "Folder_userId_workspaceId_isFavorite_idx"
ON "Folder"("userId", "workspaceId", "isFavorite");
