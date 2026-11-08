CREATE TYPE "PlatformAnnouncementAudience" AS ENUM ('ALL', 'FREE', 'PRO', 'BUSINESS');
CREATE TYPE "PlatformAnnouncementEmailStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "StoredFileUploadSource" AS ENUM ('STANDARD', 'SCAN', 'EVENT_MEDIA');

ALTER TABLE "StoredFile"
  ADD COLUMN "uploadSource" "StoredFileUploadSource" NOT NULL DEFAULT 'STANDARD';

UPDATE "StoredFile"
SET "uploadSource" = 'EVENT_MEDIA'
WHERE "eventId" IS NOT NULL;

CREATE TABLE "PlatformAnnouncement" (
  "id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "audience" "PlatformAnnouncementAudience" NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" UUID NOT NULL,
  CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAnnouncementDelivery" (
  "id" UUID NOT NULL,
  "announcementId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "inAppReadAt" TIMESTAMP(3),
  "emailStatus" "PlatformAnnouncementEmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "emailAttempts" INTEGER NOT NULL DEFAULT 0,
  "emailSentAt" TIMESTAMP(3),
  "emailLastError" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAnnouncement_createdAt_idx"
  ON "PlatformAnnouncement"("createdAt");
CREATE UNIQUE INDEX "PlatformAnnouncementDelivery_announcementId_userId_key"
  ON "PlatformAnnouncementDelivery"("announcementId", "userId");
CREATE INDEX "PlatformAnnouncementDelivery_userId_inAppReadAt_createdAt_idx"
  ON "PlatformAnnouncementDelivery"("userId", "inAppReadAt", "createdAt");
CREATE INDEX "PlatformAnnouncementDelivery_emailStatus_updatedAt_idx"
  ON "PlatformAnnouncementDelivery"("emailStatus", "updatedAt");

ALTER TABLE "PlatformAnnouncement"
  ADD CONSTRAINT "PlatformAnnouncement_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAnnouncementDelivery"
  ADD CONSTRAINT "PlatformAnnouncementDelivery_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "PlatformAnnouncement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformAnnouncementDelivery"
  ADD CONSTRAINT "PlatformAnnouncementDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
