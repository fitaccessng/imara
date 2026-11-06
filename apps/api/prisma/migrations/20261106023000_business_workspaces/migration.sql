CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "FolderPermissionEffect" AS ENUM ('GRANT', 'RESTRICT');

CREATE TABLE "Workspace" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "storageLimitBytes" BIGINT NOT NULL DEFAULT 53687091200,
  "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
  "storageReservedBytes" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Workspace_ownerUserId_idx" ON "Workspace"("ownerUserId");

CREATE TABLE "WorkspaceMember" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "displayName" VARCHAR(120),
  "role" "WorkspaceRole" NOT NULL DEFAULT 'STAFF',
  "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_id_key" ON "WorkspaceMember"("workspaceId", "id");
CREATE INDEX "WorkspaceMember_userId_status_idx" ON "WorkspaceMember"("userId", "status");

CREATE TABLE "WorkspaceInvitation" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(120),
  "role" "WorkspaceRole" NOT NULL DEFAULT 'STAFF',
  "initialPermissions" JSONB,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" CHAR(64) NOT NULL,
  "invitedById" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");
CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_email_key" ON "WorkspaceInvitation"("workspaceId", "email");
CREATE INDEX "WorkspaceInvitation_workspaceId_status_expiresAt_idx" ON "WorkspaceInvitation"("workspaceId", "status", "expiresAt");

ALTER TABLE "Folder" ADD COLUMN "workspaceId" UUID;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Folder_workspaceId_parentFolderId_idx" ON "Folder"("workspaceId", "parentFolderId");
CREATE UNIQUE INDEX "Folder_workspaceId_id_key" ON "Folder"("workspaceId", "id");

ALTER TABLE "StoredFile" ADD COLUMN "workspaceId" UUID;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "StoredFile_workspaceId_folderId_status_createdAt_idx" ON "StoredFile"("workspaceId", "folderId", "status", "createdAt");

CREATE TABLE "FolderPermission" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "folderId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "effect" "FolderPermissionEffect" NOT NULL DEFAULT 'GRANT',
  "permissionKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inherit" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FolderPermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FolderPermission_workspaceId_folderId_fkey" FOREIGN KEY ("workspaceId", "folderId") REFERENCES "Folder"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FolderPermission_workspaceId_memberId_fkey" FOREIGN KEY ("workspaceId", "memberId") REFERENCES "WorkspaceMember"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FolderPermission_workspaceId_folderId_memberId_effect_key" ON "FolderPermission"("workspaceId", "folderId", "memberId", "effect");
CREATE INDEX "FolderPermission_workspaceId_memberId_idx" ON "FolderPermission"("workspaceId", "memberId");
CREATE INDEX "FolderPermission_folderId_memberId_idx" ON "FolderPermission"("folderId", "memberId");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "actorId" UUID,
  "action" VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(80) NOT NULL,
  "targetId" VARCHAR(120),
  "metadata" JSONB,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX "AuditLog_workspaceId_actorId_createdAt_idx" ON "AuditLog"("workspaceId", "actorId", "createdAt");

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId", "createdAt");

-- Preserve personal namespace uniqueness while allowing a user to use the same
-- folder names in an independent business workspace.
DROP INDEX "Folder_root_name_key";
DROP INDEX "Folder_nested_name_key";
CREATE UNIQUE INDEX "Folder_personal_root_name_key" ON "Folder"("userId", "name")
  WHERE "workspaceId" IS NULL AND "parentFolderId" IS NULL;
CREATE UNIQUE INDEX "Folder_personal_nested_name_key" ON "Folder"("userId", "parentFolderId", "name")
  WHERE "workspaceId" IS NULL AND "parentFolderId" IS NOT NULL;
CREATE UNIQUE INDEX "Folder_workspace_root_name_key" ON "Folder"("workspaceId", "name")
  WHERE "workspaceId" IS NOT NULL AND "parentFolderId" IS NULL;
CREATE UNIQUE INDEX "Folder_workspace_nested_name_key" ON "Folder"("workspaceId", "parentFolderId", "name")
  WHERE "workspaceId" IS NOT NULL AND "parentFolderId" IS NOT NULL;

-- Scope parent and file-folder relationships to the same workspace. NULL
-- workspaceId keeps existing personal rows outside this composite constraint.
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parent_workspace_scope_fkey"
  FOREIGN KEY ("workspaceId", "parentFolderId") REFERENCES "Folder"("workspaceId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_folder_workspace_scope_fkey"
  FOREIGN KEY ("workspaceId", "folderId") REFERENCES "Folder"("workspaceId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
