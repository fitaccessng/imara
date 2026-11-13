CREATE TYPE "CalendarReminderStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "CalendarReminderChannelStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TABLE "CalendarEvent"
  ADD COLUMN "reminderMinutesBefore" INTEGER,
  ADD COLUMN "reminderAt" TIMESTAMP(3),
  ADD COLUMN "reminderRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reminderStatus" "CalendarReminderStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "CalendarEvent_reminderStatus_reminderAt_idx"
  ON "CalendarEvent"("reminderStatus", "reminderAt");

CREATE TABLE "CalendarEventTag" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  CONSTRAINT "CalendarEventTag_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "CalendarEventTag_userId_idx" ON "CalendarEventTag"("userId");
ALTER TABLE "CalendarEventTag" ADD CONSTRAINT "CalendarEventTag_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventTag" ADD CONSTRAINT "CalendarEventTag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarReminderDispatch" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "CalendarReminderStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "CalendarReminderDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarReminderDispatch_eventId_revision_key"
  ON "CalendarReminderDispatch"("eventId", "revision");
CREATE INDEX "CalendarReminderDispatch_status_scheduledFor_updatedAt_idx"
  ON "CalendarReminderDispatch"("status", "scheduledFor", "updatedAt");
ALTER TABLE "CalendarReminderDispatch" ADD CONSTRAINT "CalendarReminderDispatch_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarReminderRecipient" (
  "id" UUID NOT NULL,
  "dispatchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "inAppStatus" "CalendarReminderChannelStatus" NOT NULL DEFAULT 'PENDING',
  "emailStatus" "CalendarReminderChannelStatus" NOT NULL DEFAULT 'PENDING',
  "inAppAttemptAt" TIMESTAMP(3),
  "emailAttemptAt" TIMESTAMP(3),
  "lastError" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarReminderRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarReminderRecipient_dispatchId_userId_key"
  ON "CalendarReminderRecipient"("dispatchId", "userId");
CREATE INDEX "CalendarReminderRecipient_inAppStatus_updatedAt_idx"
  ON "CalendarReminderRecipient"("inAppStatus", "updatedAt");
CREATE INDEX "CalendarReminderRecipient_emailStatus_updatedAt_idx"
  ON "CalendarReminderRecipient"("emailStatus", "updatedAt");
ALTER TABLE "CalendarReminderRecipient" ADD CONSTRAINT "CalendarReminderRecipient_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "CalendarReminderDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarReminderRecipient" ADD CONSTRAINT "CalendarReminderRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ALTER COLUMN "workspaceId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "sourceKey" VARCHAR(200);
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");
