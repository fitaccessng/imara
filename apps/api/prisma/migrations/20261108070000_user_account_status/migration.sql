CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "User"
  ADD COLUMN "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "User_accountStatus_createdAt_idx"
  ON "User"("accountStatus", "createdAt");
