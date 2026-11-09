CREATE TYPE "WorkspaceChatConversationType" AS ENUM ('WORKSPACE', 'DIRECT');

CREATE TABLE "WorkspaceChatConversation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" "WorkspaceChatConversationType" NOT NULL,
    "channelKey" VARCHAR(100) NOT NULL,
    "memberAId" UUID,
    "memberBId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceChatConversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceChatConversation_channel_check" CHECK (
      ("type" = 'WORKSPACE' AND "channelKey" = 'workspace' AND "memberAId" IS NULL AND "memberBId" IS NULL)
      OR
      ("type" = 'DIRECT' AND "memberAId" IS NOT NULL AND "memberBId" IS NOT NULL
        AND "memberAId" < "memberBId"
        AND "channelKey" = 'direct:' || "memberAId"::text || ':' || "memberBId"::text)
    )
);

CREATE TABLE "WorkspaceChatMessage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderMemberId" UUID NOT NULL,
    "senderName" VARCHAR(120) NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceChatMessage_content_check" CHECK (length(btrim("content")) > 0)
);

CREATE UNIQUE INDEX "WorkspaceChatConversation_workspaceId_channelKey_key"
ON "WorkspaceChatConversation"("workspaceId", "channelKey");
CREATE UNIQUE INDEX "WorkspaceChatConversation_workspaceId_id_key"
ON "WorkspaceChatConversation"("workspaceId", "id");
CREATE INDEX "WorkspaceChatConversation_workspaceId_updatedAt_idx"
ON "WorkspaceChatConversation"("workspaceId", "updatedAt");
CREATE INDEX "WorkspaceChatConversation_workspaceId_memberAId_idx"
ON "WorkspaceChatConversation"("workspaceId", "memberAId");
CREATE INDEX "WorkspaceChatConversation_workspaceId_memberBId_idx"
ON "WorkspaceChatConversation"("workspaceId", "memberBId");
CREATE INDEX "WorkspaceChatMessage_workspaceId_conversationId_createdAt_id_idx"
ON "WorkspaceChatMessage"("workspaceId", "conversationId", "createdAt", "id");
CREATE INDEX "WorkspaceChatMessage_senderMemberId_createdAt_idx"
ON "WorkspaceChatMessage"("senderMemberId", "createdAt");
CREATE INDEX "WorkspaceChatMessage_fileId_idx"
ON "WorkspaceChatMessage"("fileId");

ALTER TABLE "WorkspaceChatConversation"
ADD CONSTRAINT "WorkspaceChatConversation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceChatMessage"
ADD CONSTRAINT "WorkspaceChatMessage_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceChatMessage"
ADD CONSTRAINT "WorkspaceChatMessage_workspaceId_conversationId_fkey"
FOREIGN KEY ("workspaceId", "conversationId")
REFERENCES "WorkspaceChatConversation"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceChatMessage"
ADD CONSTRAINT "WorkspaceChatMessage_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
