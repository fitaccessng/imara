CREATE TYPE "SignatureRequestStatus" AS ENUM ('PENDING', 'FINALIZING', 'COMPLETED', 'DECLINED', 'CANCELLED');
CREATE TYPE "SignatureSignerStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED');
CREATE TYPE "SignatureMethod" AS ENUM ('TYPED', 'DRAWN');

CREATE TABLE "SignatureRequest" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "sourceFileId" UUID NOT NULL,
    "sourceName" VARCHAR(255) NOT NULL,
    "sourceSnapshotKey" VARCHAR(512) NOT NULL,
    "sourceSha256" CHAR(64) NOT NULL,
    "mode" "ApprovalReviewMode" NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'PENDING',
    "finalFileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SignatureSigner" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "SignatureSignerStatus" NOT NULL DEFAULT 'PENDING',
    "method" "SignatureMethod",
    "signedName" VARCHAR(120),
    "signaturePng" TEXT,
    "signedAt" TIMESTAMP(3),
    "consentText" VARCHAR(500),
    "consentedAt" TIMESTAMP(3),
    "consentedEmail" VARCHAR(320),
    "consentIp" VARCHAR(64),
    "declineReason" VARCHAR(1000),

    CONSTRAINT "SignatureSigner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignatureRequest_finalFileId_key" ON "SignatureRequest"("finalFileId");
CREATE UNIQUE INDEX "StoredFile_workspaceId_id_key" ON "StoredFile"("workspaceId", "id");
CREATE INDEX "SignatureRequest_workspaceId_status_createdAt_idx" ON "SignatureRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "SignatureRequest_createdById_createdAt_idx" ON "SignatureRequest"("createdById", "createdAt");
CREATE UNIQUE INDEX "SignatureSigner_requestId_memberId_key" ON "SignatureSigner"("requestId", "memberId");
CREATE INDEX "SignatureSigner_userId_status_idx" ON "SignatureSigner"("userId", "status");
CREATE INDEX "SignatureSigner_requestId_order_idx" ON "SignatureSigner"("requestId", "order");

ALTER TABLE "SignatureRequest"
    ADD CONSTRAINT "SignatureRequest_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignatureRequest"
    ADD CONSTRAINT "SignatureRequest_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureRequest"
    ADD CONSTRAINT "SignatureRequest_workspaceId_sourceFileId_fkey"
    FOREIGN KEY ("workspaceId", "sourceFileId") REFERENCES "StoredFile"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureRequest"
    ADD CONSTRAINT "SignatureRequest_finalFileId_fkey"
    FOREIGN KEY ("finalFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SignatureSigner"
    ADD CONSTRAINT "SignatureSigner_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
