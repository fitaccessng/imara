CREATE TYPE "ReminderRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "Reminder" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "assignedToId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(2000),
  "dueAt" TIMESTAMP(3) NOT NULL,
  "nextDueAt" TIMESTAMP(3),
  "recurrence" "ReminderRecurrence" NOT NULL DEFAULT 'ONCE',
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "approvalRequestId" UUID,
  "completedAt" TIMESTAMP(3),
  "lastCompletedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderDelivery" (
  "id" UUID NOT NULL,
  "reminderId" UUID NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "emailStatus" "PlatformAnnouncementEmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reminder_workspaceId_dueAt_completedAt_idx" ON "Reminder"("workspaceId", "dueAt", "completedAt");
CREATE INDEX "Reminder_assignedToId_nextDueAt_completedAt_idx" ON "Reminder"("assignedToId", "nextDueAt", "completedAt");
CREATE INDEX "Reminder_createdById_createdAt_idx" ON "Reminder"("createdById", "createdAt");
CREATE UNIQUE INDEX "ReminderDelivery_reminderId_scheduledFor_key" ON "ReminderDelivery"("reminderId", "scheduledFor");
CREATE UNIQUE INDEX "Reminder_approvalRequestId_key" ON "Reminder"("approvalRequestId");
CREATE INDEX "ReminderDelivery_status_updatedAt_idx" ON "ReminderDelivery"("status", "updatedAt");

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_approvalRequestId_fkey"
  FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
