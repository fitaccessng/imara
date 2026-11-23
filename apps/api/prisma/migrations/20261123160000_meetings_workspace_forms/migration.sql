CREATE TABLE "PersonalMeeting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "transcript" VARCHAR(100000) NOT NULL,
  "summary" VARCHAR(20000),
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "recordingFileId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonalMeeting_userId_id_key" UNIQUE ("userId", "id"),
  CONSTRAINT "PersonalMeeting_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalMeeting_recordingFileId_fkey" FOREIGN KEY ("recordingFileId")
    REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PersonalMeeting_dates_check" CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "PersonalMeeting_userId_startedAt_idx" ON "PersonalMeeting"("userId", "startedAt");
CREATE INDEX "PersonalMeeting_userId_updatedAt_idx" ON "PersonalMeeting"("userId", "updatedAt");

CREATE TABLE "WorkspaceMeeting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "transcript" VARCHAR(100000) NOT NULL,
  "summary" VARCHAR(20000),
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "recordingFileId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMeeting_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "WorkspaceMeeting_workspaceId_fkey" FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMeeting_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMeeting_recordingFileId_fkey" FOREIGN KEY ("recordingFileId")
    REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMeeting_dates_check" CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "WorkspaceMeeting_workspaceId_startedAt_idx" ON "WorkspaceMeeting"("workspaceId", "startedAt");
CREATE INDEX "WorkspaceMeeting_workspaceId_updatedAt_idx" ON "WorkspaceMeeting"("workspaceId", "updatedAt");

CREATE TABLE "MeetingActionItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "personalMeetingId" UUID,
  "workspaceMeetingId" UUID,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(10000),
  "assigneeUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "personalTaskId" UUID,
  "workspaceTaskId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeetingActionItem_one_meeting_check" CHECK (("personalMeetingId" IS NOT NULL)::int + ("workspaceMeetingId" IS NOT NULL)::int = 1),
  CONSTRAINT "MeetingActionItem_one_task_check" CHECK ("personalTaskId" IS NULL OR "workspaceTaskId" IS NULL),
  CONSTRAINT "MeetingActionItem_personalMeetingId_fkey" FOREIGN KEY ("personalMeetingId")
    REFERENCES "PersonalMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionItem_workspaceMeetingId_fkey" FOREIGN KEY ("workspaceMeetingId")
    REFERENCES "WorkspaceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionItem_personalTaskId_fkey" FOREIGN KEY ("personalTaskId")
    REFERENCES "PersonalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionItem_workspaceTaskId_fkey" FOREIGN KEY ("workspaceTaskId")
    REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionItem_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MeetingActionItem_personalMeetingId_createdAt_idx" ON "MeetingActionItem"("personalMeetingId", "createdAt");
CREATE INDEX "MeetingActionItem_workspaceMeetingId_createdAt_idx" ON "MeetingActionItem"("workspaceMeetingId", "createdAt");

CREATE TABLE "WorkspaceForm" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "schema" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "tokenHash" CHAR(64),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceForm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceForm_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "WorkspaceForm_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "WorkspaceForm_workspaceId_fkey" FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceForm_ownerUserId_fkey" FOREIGN KEY ("ownerUserId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceForm_workspaceId_updatedAt_idx" ON "WorkspaceForm"("workspaceId", "updatedAt");

CREATE TABLE "WorkspaceFormResponse" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "formId" UUID NOT NULL,
  "respondentName" VARCHAR(120) NOT NULL,
  "respondentEmail" VARCHAR(320) NOT NULL,
  "answers" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceFormResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceFormResponse_workspaceId_formId_fkey" FOREIGN KEY ("workspaceId", "formId")
    REFERENCES "WorkspaceForm"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceFormResponse_workspaceId_formId_submittedAt_idx"
  ON "WorkspaceFormResponse"("workspaceId", "formId", "submittedAt");

ALTER TABLE "WorkspaceFormResponse"
  ADD CONSTRAINT "WorkspaceFormResponse_workspaceId_id_key" UNIQUE ("workspaceId", "id");

CREATE TABLE "WorkspaceFormUpload" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "formId" UUID NOT NULL,
  "questionId" VARCHAR(80) NOT NULL,
  "fileId" UUID NOT NULL,
  "responseId" UUID,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceFormUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceFormUpload_fileId_key" UNIQUE ("fileId"),
  CONSTRAINT "WorkspaceFormUpload_workspaceId_formId_fkey" FOREIGN KEY ("workspaceId", "formId")
    REFERENCES "WorkspaceForm"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceFormUpload_workspaceId_fileId_fkey" FOREIGN KEY ("workspaceId", "fileId")
    REFERENCES "StoredFile"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceFormUpload_workspaceId_responseId_fkey" FOREIGN KEY ("workspaceId", "responseId")
    REFERENCES "WorkspaceFormResponse"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceFormUpload_workspaceId_formId_questionId_responseId_idx"
  ON "WorkspaceFormUpload"("workspaceId", "formId", "questionId", "responseId");
