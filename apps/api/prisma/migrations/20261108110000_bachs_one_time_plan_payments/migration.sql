CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXPIRED');

ALTER TABLE "Subscription"
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "plan" "Plan" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "checkoutId" VARCHAR(128),
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttempt_checkoutId_key" ON "PaymentAttempt"("checkoutId");
CREATE INDEX "PaymentAttempt_userId_createdAt_idx" ON "PaymentAttempt"("userId", "createdAt");
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");
ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "PlanCatalogue"
SET "monthlyPriceMinor" = 300000, "updatedAt" = CURRENT_TIMESTAMP
WHERE "plan" = 'PRO';

UPDATE "PlanCatalogue"
SET "monthlyPriceMinor" = 1000000, "updatedAt" = CURRENT_TIMESTAMP
WHERE "plan" = 'BUSINESS';
