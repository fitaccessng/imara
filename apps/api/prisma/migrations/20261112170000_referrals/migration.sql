ALTER TABLE "User"
  ADD COLUMN "referralCode" VARCHAR(32),
  ADD COLUMN "referredByUserId" UUID;

UPDATE "User"
SET "referralCode" = UPPER(REPLACE("id"::text, '-', ''))
WHERE "referralCode" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "referralCode" SET NOT NULL;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredByUserId_emailVerifiedAt_idx"
  ON "User"("referredByUserId", "emailVerifiedAt");
ALTER TABLE "User"
  ADD CONSTRAINT "User_referredByUserId_fkey"
  FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReferralReward" (
  "id" UUID NOT NULL,
  "inviterUserId" UUID NOT NULL,
  "verifiedReferralCount" INTEGER NOT NULL,
  "storageBytes" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralReward_inviterUserId_verifiedReferralCount_key"
  ON "ReferralReward"("inviterUserId", "verifiedReferralCount");
CREATE INDEX "ReferralReward_inviterUserId_createdAt_idx"
  ON "ReferralReward"("inviterUserId", "createdAt");
ALTER TABLE "ReferralReward"
  ADD CONSTRAINT "ReferralReward_inviterUserId_fkey"
  FOREIGN KEY ("inviterUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferralProgramConfig" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'default',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "title" VARCHAR(100) NOT NULL DEFAULT 'Share IMARA. Grow your space.',
  "message" VARCHAR(500) NOT NULL DEFAULT 'Invite friends to join IMARA. For every five verified referrals, you’ll receive an extra 1 GB of storage.',
  "linkTemplate" VARCHAR(500) NOT NULL DEFAULT 'https://www.useimara.space/register?ref={code}',
  "copyInstructions" VARCHAR(2000) NOT NULL DEFAULT 'Copy your referral link and share it with friends.',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralProgramConfig_pkey" PRIMARY KEY ("id")
);
INSERT INTO "ReferralProgramConfig" ("id", "active", "title", "message", "linkTemplate", "copyInstructions", "updatedAt")
VALUES ('default', false, 'Share IMARA. Grow your space.',
        'Invite friends to join IMARA. For every five verified referrals, you’ll receive an extra 1 GB of storage.',
        'https://www.useimara.space/register?ref={code}',
        'Copy your referral link and share it with friends.', CURRENT_TIMESTAMP);
