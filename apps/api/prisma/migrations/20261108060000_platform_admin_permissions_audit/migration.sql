CREATE TYPE "PlatformAdminRole" AS ENUM (
  'SUPER_ADMIN',
  'USER_MANAGEMENT_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_ADMIN',
  'MARKETING_ADMIN',
  'OPERATIONS_ADMIN',
  'SECURITY_ADMIN'
);

CREATE TYPE "PlatformAdminStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TABLE "PlatformAdminProfile" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "PlatformAdminRole" NOT NULL,
  "status" "PlatformAdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAdminProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdminProfile_userId_key"
  ON "PlatformAdminProfile"("userId");
CREATE INDEX "PlatformAdminProfile_role_status_idx"
  ON "PlatformAdminProfile"("role", "status");

ALTER TABLE "PlatformAdminProfile"
  ADD CONSTRAINT "PlatformAdminProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve access for users already marked ADMIN by assigning the explicit
-- highest-privilege profile. The UserRole.ADMIN check remains a second gate.
INSERT INTO "PlatformAdminProfile" ("id", "userId", "role", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'SUPER_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
WHERE "role" = 'ADMIN';

CREATE TABLE "PlatformAdminAuditLog" (
  "id" UUID NOT NULL,
  "actorId" UUID,
  "action" VARCHAR(100) NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" VARCHAR(120),
  "metadata" JSONB,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAdminAuditLog_createdAt_idx"
  ON "PlatformAdminAuditLog"("createdAt");
CREATE INDEX "PlatformAdminAuditLog_actorId_createdAt_idx"
  ON "PlatformAdminAuditLog"("actorId", "createdAt");
CREATE INDEX "PlatformAdminAuditLog_action_createdAt_idx"
  ON "PlatformAdminAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAdminAuditLog_resourceType_resourceId_idx"
  ON "PlatformAdminAuditLog"("resourceType", "resourceId");

ALTER TABLE "PlatformAdminAuditLog"
  ADD CONSTRAINT "PlatformAdminAuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
