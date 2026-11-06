CREATE TYPE "EventGallerySetting" AS ENUM ('PRIVATE', 'LINK_PUBLIC', 'PASSCODE');
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'DELETING');

CREATE TABLE "Event" (
  "id" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "folderId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "description" VARCHAR(4000),
  "captureTokenHash" CHAR(64) NOT NULL,
  "galleryTokenHash" CHAR(64) NOT NULL,
  "gallerySetting" "EventGallerySetting" NOT NULL DEFAULT 'PRIVATE',
  "galleryPasscodeHash" VARCHAR(255),
  "storageCapBytes" BIGINT NOT NULL,
  "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
  "storageReservedBytes" BIGINT NOT NULL DEFAULT 0,
  "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Event_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Event_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Event_captureTokenHash_key" ON "Event"("captureTokenHash");
CREATE UNIQUE INDEX "Event_galleryTokenHash_key" ON "Event"("galleryTokenHash");
CREATE INDEX "Event_ownerUserId_date_idx" ON "Event"("ownerUserId", "date");
CREATE INDEX "Event_gallerySetting_status_idx" ON "Event"("gallerySetting", "status");

CREATE TABLE "EventGalleryGrant" (
  "id" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventGalleryGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventGalleryGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventGalleryGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EventGalleryGrant_tokenHash_key" ON "EventGalleryGrant"("tokenHash");
CREATE INDEX "EventGalleryGrant_eventId_expiresAt_idx" ON "EventGalleryGrant"("eventId", "expiresAt");
CREATE INDEX "EventGalleryGrant_userId_expiresAt_idx" ON "EventGalleryGrant"("userId", "expiresAt");

ALTER TABLE "StoredFile" ADD COLUMN "eventId" UUID;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StoredFile_eventId_status_createdAt_idx" ON "StoredFile"("eventId", "status", "createdAt");
