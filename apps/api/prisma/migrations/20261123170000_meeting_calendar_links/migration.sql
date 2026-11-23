ALTER TABLE "CalendarEvent"
  ADD COLUMN "personalMeetingId" UUID,
  ADD COLUMN "workspaceMeetingId" UUID,
  ADD CONSTRAINT "CalendarEvent_one_meeting_check"
    CHECK ("personalMeetingId" IS NULL OR "workspaceMeetingId" IS NULL),
  ADD CONSTRAINT "CalendarEvent_createdById_personalMeetingId_key" UNIQUE ("createdById", "personalMeetingId"),
  ADD CONSTRAINT "CalendarEvent_workspaceId_workspaceMeetingId_key" UNIQUE ("workspaceId", "workspaceMeetingId"),
  ADD CONSTRAINT "CalendarEvent_createdById_personalMeetingId_fkey"
    FOREIGN KEY ("createdById", "personalMeetingId")
    REFERENCES "PersonalMeeting"("userId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarEvent_workspaceId_workspaceMeetingId_fkey"
    FOREIGN KEY ("workspaceId", "workspaceMeetingId")
    REFERENCES "WorkspaceMeeting"("workspaceId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE;
