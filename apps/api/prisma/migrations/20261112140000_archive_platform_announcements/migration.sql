ALTER TABLE "PlatformAnnouncement"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "PlatformAnnouncement_archivedAt_createdAt_idx"
ON "PlatformAnnouncement"("archivedAt", "createdAt");
