CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCOUNT', 'BILLING', 'FILES', 'EVENTS', 'OTHER');

CREATE TABLE "SupportTicket" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "assignedAdminId" UUID,
  "subject" VARCHAR(160) NOT NULL,
  "category" "SupportTicketCategory" NOT NULL,
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketMessage" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "internalNote" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_userId_createdAt_idx"
  ON "SupportTicket"("userId", "createdAt");
CREATE INDEX "SupportTicket_status_priority_updatedAt_idx"
  ON "SupportTicket"("status", "priority", "updatedAt");
CREATE INDEX "SupportTicket_assignedAdminId_status_updatedAt_idx"
  ON "SupportTicket"("assignedAdminId", "status", "updatedAt");
CREATE INDEX "SupportTicketMessage_ticketId_internalNote_createdAt_idx"
  ON "SupportTicketMessage"("ticketId", "internalNote", "createdAt");
CREATE INDEX "SupportTicketMessage_authorId_createdAt_idx"
  ON "SupportTicketMessage"("authorId", "createdAt");

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
