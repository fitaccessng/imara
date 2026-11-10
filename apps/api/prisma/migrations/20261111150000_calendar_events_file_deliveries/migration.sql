CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "workspaceId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "message" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEvent_createdById_workspaceId_startsAt_idx"
    ON "CalendarEvent"("createdById", "workspaceId", "startsAt");
CREATE INDEX "CalendarEvent_workspaceId_startsAt_endsAt_idx"
    ON "CalendarEvent"("workspaceId", "startsAt", "endsAt");
CREATE INDEX "FileDelivery_workspaceId_senderId_createdAt_idx"
    ON "FileDelivery"("workspaceId", "senderId", "createdAt");
CREATE INDEX "FileDelivery_workspaceId_recipientId_createdAt_idx"
    ON "FileDelivery"("workspaceId", "recipientId", "createdAt");
CREATE INDEX "FileDelivery_fileId_idx" ON "FileDelivery"("fileId");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileDelivery" ADD CONSTRAINT "FileDelivery_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileDelivery" ADD CONSTRAINT "FileDelivery_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileDelivery" ADD CONSTRAINT "FileDelivery_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileDelivery" ADD CONSTRAINT "FileDelivery_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
