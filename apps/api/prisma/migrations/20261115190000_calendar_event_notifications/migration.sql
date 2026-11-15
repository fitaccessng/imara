CREATE TYPE "CalendarReminderDispatchKind" AS ENUM ('REMINDER', 'EVENT_CREATED', 'EVENT_UPDATED');

ALTER TABLE "CalendarEvent"
  ADD COLUMN "notificationRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CalendarReminderDispatch"
  ADD COLUMN "kind" "CalendarReminderDispatchKind" NOT NULL DEFAULT 'REMINDER';

DROP INDEX "CalendarReminderDispatch_eventId_revision_key";
CREATE UNIQUE INDEX "CalendarReminderDispatch_eventId_revision_kind_key"
  ON "CalendarReminderDispatch"("eventId", "revision", "kind");
