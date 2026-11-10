UPDATE "WorkspaceMember" AS member
SET "role" = 'OWNER',
    "status" = 'ACTIVE'
FROM "Workspace" AS workspace
WHERE member."workspaceId" = workspace."id"
  AND member."userId" = workspace."ownerUserId";

UPDATE "WorkspaceMember" AS member
SET "role" = 'STAFF'
FROM "Workspace" AS workspace
WHERE member."workspaceId" = workspace."id"
  AND member."role" = 'OWNER'
  AND member."userId" <> workspace."ownerUserId";

INSERT INTO "WorkspaceMember" (
  "id", "workspaceId", "userId", "role", "status", "joinedAt", "updatedAt"
)
SELECT
  gen_random_uuid(), workspace."id", workspace."ownerUserId", 'OWNER', 'ACTIVE',
  workspace."createdAt", CURRENT_TIMESTAMP
FROM "Workspace" AS workspace
WHERE NOT EXISTS (
  SELECT 1
  FROM "WorkspaceMember" AS member
  WHERE member."workspaceId" = workspace."id"
    AND member."userId" = workspace."ownerUserId"
);
