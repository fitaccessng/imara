CREATE TYPE "PersonalTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

ALTER TABLE "PersonalNote"
  ADD CONSTRAINT "PersonalNote_userId_id_key" UNIQUE ("userId", "id");
ALTER TABLE "StoredFile"
  ADD CONSTRAINT "StoredFile_userId_id_key" UNIQUE ("userId", "id");

CREATE TABLE "PersonalNoteAttachment" (
  "userId" UUID NOT NULL,
  "noteId" UUID NOT NULL,
  "fileId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalNoteAttachment_pkey" PRIMARY KEY ("noteId", "fileId"),
  CONSTRAINT "PersonalNoteAttachment_userId_noteId_fkey"
    FOREIGN KEY ("userId", "noteId") REFERENCES "PersonalNote"("userId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalNoteAttachment_userId_fileId_fkey"
    FOREIGN KEY ("userId", "fileId") REFERENCES "StoredFile"("userId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PersonalNoteAttachment_userId_noteId_idx" ON "PersonalNoteAttachment"("userId", "noteId");
CREATE INDEX "PersonalNoteAttachment_userId_fileId_idx" ON "PersonalNoteAttachment"("userId", "fileId");

CREATE TABLE "PersonalTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "assigneeUserId" UUID,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(10000),
  "status" "PersonalTaskStatus" NOT NULL DEFAULT 'TODO',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonalTask_userId_id_key" UNIQUE ("userId", "id"),
  CONSTRAINT "PersonalTask_owner_creator_check" CHECK ("creatorId" = "userId"),
  CONSTRAINT "PersonalTask_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100),
  CONSTRAINT "PersonalTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PersonalTask_userId_status_dueAt_idx" ON "PersonalTask"("userId", "status", "dueAt");
CREATE INDEX "PersonalTask_userId_updatedAt_idx" ON "PersonalTask"("userId", "updatedAt");
CREATE INDEX "PersonalTask_creatorId_createdAt_idx" ON "PersonalTask"("creatorId", "createdAt");

CREATE TABLE "PersonalTaskAttachment" (
  "userId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "fileId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalTaskAttachment_pkey" PRIMARY KEY ("taskId", "fileId"),
  CONSTRAINT "PersonalTaskAttachment_userId_taskId_fkey"
    FOREIGN KEY ("userId", "taskId") REFERENCES "PersonalTask"("userId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalTaskAttachment_userId_fileId_fkey"
    FOREIGN KEY ("userId", "fileId") REFERENCES "StoredFile"("userId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PersonalTaskAttachment_userId_taskId_idx" ON "PersonalTaskAttachment"("userId", "taskId");
CREATE INDEX "PersonalTaskAttachment_userId_fileId_idx" ON "PersonalTaskAttachment"("userId", "fileId");

ALTER TABLE "CalendarEvent"
  ADD COLUMN "linkedFileId" UUID,
  ADD COLUMN "personalTaskId" UUID,
  ADD COLUMN "workspaceTaskId" UUID,
  ADD CONSTRAINT "CalendarEvent_linked_task_scope_check"
    CHECK ("personalTaskId" IS NULL OR "workspaceTaskId" IS NULL),
  ADD CONSTRAINT "CalendarEvent_linkedFileId_fkey" FOREIGN KEY ("linkedFileId")
    REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarEvent_personalTaskId_fkey" FOREIGN KEY ("personalTaskId")
    REFERENCES "PersonalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarEvent_workspaceTaskId_fkey" FOREIGN KEY ("workspaceTaskId")
    REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CalendarEvent_linkedFileId_idx" ON "CalendarEvent"("linkedFileId");
CREATE INDEX "CalendarEvent_personalTaskId_idx" ON "CalendarEvent"("personalTaskId");
CREATE INDEX "CalendarEvent_workspaceTaskId_idx" ON "CalendarEvent"("workspaceTaskId");
