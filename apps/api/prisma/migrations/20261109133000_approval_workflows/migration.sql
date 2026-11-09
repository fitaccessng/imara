CREATE TYPE "ApprovalReviewMode" AS ENUM ('SEQUENTIAL', 'PARALLEL');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('IN_PROGRESS', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

CREATE TABLE "ApprovalTemplate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalTemplateStep" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "mode" "ApprovalReviewMode" NOT NULL,
    CONSTRAINT "ApprovalTemplateStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalTemplateApprover" (
    "id" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    CONSTRAINT "ApprovalTemplateApprover_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "requesterId" UUID,
    "templateId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequestStep" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "mode" "ApprovalReviewMode" NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ApprovalRequestStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequestApprover" (
    "id" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "ApprovalRequestApprover_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalActivity" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "comment" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalAttachment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fileId" UUID,
    "fileName" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalTemplate_workspaceId_isActive_createdAt_idx" ON "ApprovalTemplate"("workspaceId", "isActive", "createdAt");
CREATE UNIQUE INDEX "ApprovalTemplateStep_templateId_stepOrder_key" ON "ApprovalTemplateStep"("templateId", "stepOrder");
CREATE UNIQUE INDEX "ApprovalTemplateApprover_stepId_memberId_key" ON "ApprovalTemplateApprover"("stepId", "memberId");
CREATE INDEX "ApprovalTemplateApprover_memberId_idx" ON "ApprovalTemplateApprover"("memberId");
CREATE INDEX "ApprovalRequest_workspaceId_status_createdAt_idx" ON "ApprovalRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_requesterId_status_createdAt_idx" ON "ApprovalRequest"("requesterId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_workspaceId_dueAt_status_idx" ON "ApprovalRequest"("workspaceId", "dueAt", "status");
CREATE UNIQUE INDEX "ApprovalRequestStep_requestId_stepOrder_key" ON "ApprovalRequestStep"("requestId", "stepOrder");
CREATE UNIQUE INDEX "ApprovalRequestApprover_stepId_memberId_key" ON "ApprovalRequestApprover"("stepId", "memberId");
CREATE INDEX "ApprovalRequestApprover_memberId_decision_idx" ON "ApprovalRequestApprover"("memberId", "decision");
CREATE INDEX "ApprovalActivity_requestId_createdAt_idx" ON "ApprovalActivity"("requestId", "createdAt");
CREATE UNIQUE INDEX "ApprovalAttachment_requestId_fileId_key" ON "ApprovalAttachment"("requestId", "fileId");
CREATE INDEX "ApprovalAttachment_fileId_idx" ON "ApprovalAttachment"("fileId");

ALTER TABLE "ApprovalTemplate" ADD CONSTRAINT "ApprovalTemplate_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTemplateStep" ADD CONSTRAINT "ApprovalTemplateStep_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ApprovalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTemplateApprover" ADD CONSTRAINT "ApprovalTemplateApprover_stepId_fkey"
FOREIGN KEY ("stepId") REFERENCES "ApprovalTemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTemplateApprover" ADD CONSTRAINT "ApprovalTemplateApprover_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ApprovalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequestStep" ADD CONSTRAINT "ApprovalRequestStep_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequestApprover" ADD CONSTRAINT "ApprovalRequestApprover_stepId_fkey"
FOREIGN KEY ("stepId") REFERENCES "ApprovalRequestStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequestApprover" ADD CONSTRAINT "ApprovalRequestApprover_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalActivity" ADD CONSTRAINT "ApprovalActivity_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalActivity" ADD CONSTRAINT "ApprovalActivity_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalAttachment" ADD CONSTRAINT "ApprovalAttachment_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAttachment" ADD CONSTRAINT "ApprovalAttachment_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
