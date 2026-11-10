CREATE TABLE "PublicFileShare" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fileId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PublicFileShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicFileShare_tokenHash_key" ON "PublicFileShare"("tokenHash");
CREATE INDEX "PublicFileShare_fileId_createdAt_idx" ON "PublicFileShare"("fileId", "createdAt");

ALTER TABLE "PublicFileShare"
ADD CONSTRAINT "PublicFileShare_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
