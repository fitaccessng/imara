CREATE TYPE "WorkspaceTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

CREATE TABLE "WorkspaceNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(50000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceNote_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
    CONSTRAINT "WorkspaceNote_workspaceId_fkey" FOREIGN KEY ("workspaceId")
      REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceNote_authorId_fkey" FOREIGN KEY ("authorId")
      REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceNote_workspaceId_updatedAt_idx" ON "WorkspaceNote"("workspaceId", "updatedAt");
CREATE INDEX "WorkspaceNote_authorId_createdAt_idx" ON "WorkspaceNote"("authorId", "createdAt");

CREATE TABLE "WorkspaceNoteAttachment" (
    "workspaceId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceNoteAttachment_pkey" PRIMARY KEY ("noteId", "fileId"),
    CONSTRAINT "WorkspaceNoteAttachment_workspaceId_noteId_fkey" FOREIGN KEY ("workspaceId", "noteId")
      REFERENCES "WorkspaceNote"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceNoteAttachment_workspaceId_fileId_fkey" FOREIGN KEY ("workspaceId", "fileId")
      REFERENCES "StoredFile"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceNoteAttachment_workspaceId_fileId_idx" ON "WorkspaceNoteAttachment"("workspaceId", "fileId");

CREATE TABLE "WorkspaceTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "assigneeUserId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(10000),
    "status" "WorkspaceTaskStatus" NOT NULL DEFAULT 'TODO',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceTask_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
    CONSTRAINT "WorkspaceTask_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100),
    CONSTRAINT "WorkspaceTask_workspaceId_fkey" FOREIGN KEY ("workspaceId")
      REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceTask_creatorId_fkey" FOREIGN KEY ("creatorId")
      REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceTask_workspaceId_assigneeUserId_fkey" FOREIGN KEY ("workspaceId", "assigneeUserId")
      REFERENCES "WorkspaceMember"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceTask_workspaceId_status_dueAt_idx" ON "WorkspaceTask"("workspaceId", "status", "dueAt");
CREATE INDEX "WorkspaceTask_workspaceId_assigneeUserId_status_idx" ON "WorkspaceTask"("workspaceId", "assigneeUserId", "status");
CREATE INDEX "WorkspaceTask_creatorId_createdAt_idx" ON "WorkspaceTask"("creatorId", "createdAt");

CREATE TABLE "WorkspaceTaskAttachment" (
    "workspaceId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceTaskAttachment_pkey" PRIMARY KEY ("taskId", "fileId"),
    CONSTRAINT "WorkspaceTaskAttachment_workspaceId_taskId_fkey" FOREIGN KEY ("workspaceId", "taskId")
      REFERENCES "WorkspaceTask"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceTaskAttachment_workspaceId_fileId_fkey" FOREIGN KEY ("workspaceId", "fileId")
      REFERENCES "StoredFile"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceTaskAttachment_workspaceId_fileId_idx" ON "WorkspaceTaskAttachment"("workspaceId", "fileId");
