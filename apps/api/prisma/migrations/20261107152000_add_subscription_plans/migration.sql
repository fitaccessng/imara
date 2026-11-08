ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'BUSINESS';

ALTER TABLE "Workspace"
  ALTER COLUMN "storageLimitBytes" SET DEFAULT 5368709120;

UPDATE "Workspace" AS workspace
SET "storageLimitBytes" = subscription."storageLimitBytes"
FROM "Subscription" AS subscription
WHERE workspace."ownerUserId" = subscription."userId";
