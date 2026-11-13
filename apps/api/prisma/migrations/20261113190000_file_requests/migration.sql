CREATE TABLE "FileRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorUserId" UUID NOT NULL,
    "folderId" UUID,
    "tokenHash" CHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL DEFAULT 'File request',
    "message" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "FileRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileRequest_tokenHash_key" ON "FileRequest"("tokenHash");
CREATE INDEX "FileRequest_creatorUserId_createdAt_idx" ON "FileRequest"("creatorUserId", "createdAt");
CREATE INDEX "FileRequest_folderId_idx" ON "FileRequest"("folderId");

ALTER TABLE "FileRequest"
ADD CONSTRAINT "FileRequest_creatorUserId_fkey"
FOREIGN KEY ("creatorUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileRequest"
ADD CONSTRAINT "FileRequest_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoredFile"
ADD COLUMN "fileRequestId" UUID;

CREATE INDEX "StoredFile_fileRequestId_idx" ON "StoredFile"("fileRequestId");

ALTER TABLE "StoredFile"
ADD CONSTRAINT "StoredFile_fileRequestId_fkey"
FOREIGN KEY ("fileRequestId") REFERENCES "FileRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
