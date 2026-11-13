CREATE TYPE "AdminEmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "AdminEmailCampaign" (
  "id" UUID NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "preheader" VARCHAR(250),
  "html" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminEmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminEmailCampaign_createdAt_idx"
  ON "AdminEmailCampaign"("createdAt");

CREATE TABLE "AdminEmailCampaignDelivery" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "AdminEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "lastError" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminEmailCampaignDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminEmailCampaignDelivery_campaignId_userId_key"
  ON "AdminEmailCampaignDelivery"("campaignId", "userId");
CREATE INDEX "AdminEmailCampaignDelivery_status_updatedAt_idx"
  ON "AdminEmailCampaignDelivery"("status", "updatedAt");
CREATE INDEX "AdminEmailCampaignDelivery_campaignId_status_idx"
  ON "AdminEmailCampaignDelivery"("campaignId", "status");

ALTER TABLE "AdminEmailCampaign"
  ADD CONSTRAINT "AdminEmailCampaign_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminEmailCampaignDelivery"
  ADD CONSTRAINT "AdminEmailCampaignDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "AdminEmailCampaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminEmailCampaignDelivery"
  ADD CONSTRAINT "AdminEmailCampaignDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
