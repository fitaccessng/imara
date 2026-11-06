# DATABASE SCHEMA

## Core principles
- PostgreSQL is the primary relational store.
- Object blobs remain in S3-compatible object storage.
- Audit fields are present on all mutable tables.
- Soft-delete is required for core business entities that may be restored.
- All user and workspace-scoped actions must be traceable.

## Tables

### User
- id: UUID PK
- email: VARCHAR(255) unique, indexed
- passwordHash: TEXT
- emailVerifiedAt: TIMESTAMPTZ nullable
- isActive: BOOLEAN default true
- isSuspended: BOOLEAN default false
- createdAt, updatedAt, deletedAt

### Profile
- id: UUID PK
- userId: UUID FK -> User.id
- firstName, lastName
- avatarUrl, timezone, locale
- createdAt, updatedAt

### Session
- id: UUID PK
- userId: UUID FK -> User.id
- refreshTokenHash: TEXT
- deviceInfo, userAgent, ipAddress
- expiresAt: TIMESTAMPTZ
- revokedAt: TIMESTAMPTZ nullable
- createdAt, updatedAt

### EmailVerificationToken
- id: UUID PK
- userId: UUID FK -> User.id
- tokenHash: TEXT unique
- expiresAt: TIMESTAMPTZ
- usedAt: TIMESTAMPTZ nullable

### PasswordResetToken
- id: UUID PK
- userId: UUID FK -> User.id
- tokenHash: TEXT unique
- expiresAt: TIMESTAMPTZ
- usedAt: TIMESTAMPTZ nullable

### Workspace
- id: UUID PK
- ownerId: UUID FK -> User.id
- name, description
- kind: personal | business
- storageQuotaBytes: BIGINT
- storageUsedBytes: BIGINT
- createdAt, updatedAt, deletedAt

### WorkspaceMember
- id: UUID PK
- workspaceId: UUID FK -> Workspace.id
- userId: UUID FK -> User.id
- roleId: UUID FK -> Role.id
- invitedByUserId: UUID FK -> User.id nullable
- joinedAt, revokedAt

### Role
- id: UUID PK
- name, code
- workspaceScope: personal | business | global
- createdAt, updatedAt

### Permission
- id: UUID PK
- code, label, description
- createdAt, updatedAt

### Plan
- id: UUID PK
- code, name, priceCents, currency
- storageQuotaBytes, maxTeamMembers
- isActive, createdAt, updatedAt

### Subscription
- id: UUID PK
- userId: UUID FK -> User.id
- workspaceId: UUID nullable FK -> Workspace.id
- planId: UUID FK -> Plan.id
- status: active | past_due | cancelled | expired | trialing
- currentPeriodStart, currentPeriodEnd
- cancelAtPeriodEnd, createdAt, updatedAt

### StorageUsageSnapshot
- id: UUID PK
- userId: UUID FK -> User.id
- workspaceId: UUID FK -> Workspace.id
- usedBytes: BIGINT
- quotaBytes: BIGINT
- capturedAt: TIMESTAMPTZ

### Folder
- id: UUID PK
- workspaceId: UUID FK -> Workspace.id
- parentFolderId: UUID FK -> Folder.id nullable
- ownerId: UUID FK -> User.id
- name, path
- isProtected: BOOLEAN default false
- lockState: unlocked | locked
- deletedAt nullable
- createdAt, updatedAt

### FolderPin
- id: UUID PK
- folderId: UUID FK -> Folder.id unique
- pinHash: TEXT
- attempts: INT
- lockedUntil TIMESTAMPTZ nullable
- createdAt, updatedAt

### File
- id: UUID PK
- workspaceId: UUID FK -> Workspace.id
- folderId: UUID FK -> Folder.id nullable
- ownerId: UUID FK -> User.id
- filename, originalName, mimeType, extension
- sizeBytes: BIGINT
- objectKey: TEXT
- checksumSHA256: TEXT nullable
- isStarred: BOOLEAN default false
- deletedAt nullable
- createdAt, updatedAt

### FileVersion
- id: UUID PK
- fileId: UUID FK -> File.id
- versionNumber: INT
- objectKey: TEXT
- sizeBytes: BIGINT
- createdByUserId: UUID FK -> User.id
- createdAt

### UploadSession
- id: UUID PK
- userId: UUID FK -> User.id
- workspaceId: UUID FK -> Workspace.id
- folderId: UUID FK -> Folder.id nullable
- status: pending | uploading | completed | cancelled | expired
- totalBytes: BIGINT
- reservedBytes: BIGINT
- createdAt, expiresAt, completedAt

### ShareLink
- id: UUID PK
- resourceType: file | folder
- resourceId: UUID
- ownerId: UUID FK -> User.id
- tokenHash: TEXT unique
- passwordHash: TEXT nullable
- expiresAt: TIMESTAMPTZ nullable
- isPublic: BOOLEAN default true
- accessMode: view | edit | download
- createdAt, updatedAt, revokedAt

### ShareAccessLog
- id: UUID PK
- shareLinkId: UUID FK -> ShareLink.id
- viewerUserId: UUID nullable,
- ipAddress, userAgent
- accessedAt

### Notification
- id: UUID PK
- userId: UUID FK -> User.id
- type, title, body, payloadJSON
- isRead: BOOLEAN default false
- createdAt, readAt

### AuditLog
- id: UUID PK
- actorUserId: UUID nullable FK -> User.id
- targetType, targetId
- action, metadataJSON
- ipAddress, userAgent
- createdAt

### Payment
- id: UUID PK
- userId: UUID FK -> User.id
- workspaceId: UUID nullable FK -> Workspace.id
- provider: stripe | flutterwave | paystack
- providerReference, status
- amountCents, currency
- createdAt, updatedAt, processedAt

### Invoice
- id: UUID PK
- userId: UUID FK -> User.id
- subscriptionId: UUID FK -> Subscription.id
- amountCents, currency, status
- issuedAt, dueAt, paidAt

### BillingProfile
- id: UUID PK
- userId: UUID FK -> User.id
- country, city, addressLine1, addressLine2
- taxId, postalCode
- createdAt, updatedAt

### ActivityLog
- id: UUID PK
- userId: UUID FK -> User.id
- resourceType, resourceId
- action, metadataJSON
- createdAt

### WebhookEvent
- id: UUID PK
- provider, eventType, payloadJSON, signature, status, processedAt

### SystemSetting
- id: UUID PK
- key, value, scope, updatedAt

### MalwareScanResult
- id: UUID PK
- fileId: UUID FK -> File.id
- status: clean | suspicious | failed
- providerName, summaryText
- createdAt
