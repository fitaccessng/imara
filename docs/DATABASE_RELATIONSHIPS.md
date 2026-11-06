# DATABASE RELATIONSHIPS

## Relationship map
- User has one Profile and many Sessions, Workspaces, Files, Notifications, Payments, and AuditLog entries.
- Workspace belongs to one Owner and may have many Members, Folders, Files, and StorageUsageSnapshot records.
- Folder has many child folders and many files; a folder can be protected with one FolderPin.
- File belongs to one Workspace, one Folder, and one Owner; it has many FileVersion records.
- Subscription belongs to one User and one Plan; invoice records are linked to one subscription.
- ShareLink belongs to one resource owner and points to a file or folder; it can generate many access logs.
- AuditLog captures actor-target actions throughout the system and is append-only for compliance.

## Relationship notes
- Personal accounts and business workspaces are different access contexts but share the same core identity model.
- Personal workspaces are typically owned by a single user with no external member list.
- Business workspaces introduce team membership and role-based access management that scopes shared files/folders.
- Storage is measured across workspaces and users, but the effective allowance is usually plan-based and checked against workspace and ownership boundaries.

## Recommended indexes
- User(email)
- Workspace(ownerId)
- WorkspaceMember(workspaceId, userId)
- Folder(workspaceId, parentFolderId)
- File(workspaceId, folderId, ownerId)
- FileVersion(fileId, versionNumber)
- ShareLink(resourceId, resourceType, ownerId)
- Notification(userId, isRead)
- AuditLog(createdAt)
- Payment(userId, status)
- Subscription(userId, status)
