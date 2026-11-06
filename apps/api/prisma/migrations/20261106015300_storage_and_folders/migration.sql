CREATE TYPE "StoredFileStatus" AS ENUM ('UPLOADING', 'READY', 'DELETING');

ALTER TABLE "Subscription"
ADD COLUMN "storageReservedBytes" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentFolderId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "folderId" UUID,
    "objectKey" VARCHAR(512) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(255) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "StoredFileStatus" NOT NULL DEFAULT 'UPLOADING',
    "quotaReserved" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Folder_userId_parentFolderId_idx" ON "Folder"("userId", "parentFolderId");
CREATE INDEX "Folder_userId_parentFolderId_name_idx" ON "Folder"("userId", "parentFolderId", "name");
CREATE UNIQUE INDEX "Folder_root_name_key" ON "Folder"("userId", "name") WHERE "parentFolderId" IS NULL;
CREATE UNIQUE INDEX "Folder_nested_name_key" ON "Folder"("userId", "parentFolderId", "name") WHERE "parentFolderId" IS NOT NULL;
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");
CREATE INDEX "StoredFile_userId_folderId_status_createdAt_idx" ON "StoredFile"("userId", "folderId", "status", "createdAt");

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentFolderId_fkey"
  FOREIGN KEY ("parentFolderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
