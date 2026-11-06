# BUSINESS RULES

## Core storage and quota rules
- Free personal subscriptions have a 5 GiB logical storage quota; the quota migration updates existing FREE subscriptions as well as the default for new accounts.
- Uploads must reserve quota before object storage is committed to avoid oversubscription.
- Concurrent upload reservations must be atomic and released on cancellation or failure.
- Trash items remain counted as storage usage until permanent purge or expiration occurs.
- Downgrades trigger entitlement checks and may reduce available capability even when files remain stored.

## Folder and security rules
- Protected folders require a six-digit PIN enforced server-side.
- PIN hashing must use a strong key-derivation method; raw PINs are never stored.
- Locking a folder should prevent general access until verification or an authorized unlock occurs.
- Recover access flows must validate identity and ownership before granting access.

## File ownership and sharing rules
- Files are owned by a user and associated with one workspace and optionally one folder.
- Shared files must preserve primary ownership while allowing scoped access rules.
- Workspace access is separate from subscription access and must be evaluated for every request.
- Link-based access can be public or recipient-only; password and expiration are optional but enforced when present.

## Subscription and billing rules
- Plan changes must be processed with provider verification and idempotent payment logic.
- Subscription expiry must lead to downgrade or suspension rules without deleting storage content immediately.
- Payment history and invoices must remain immutable once generated.

## Data retention and cleanup rules
- Soft-deleted files and folders are retained for a defined grace period before permanent cleanup.
- Upload sessions expire if incomplete.
- Audit logs must retain security-sensitive actions for compliance and platform review.
- Account deletion must remove access and soft-delete identity records while preserving needed audit references.

## Backend-only enforcement
The following rules are not presentation-only and must be enforced on the backend:
- quota verification
- upload reservation and cleanup
- file ownership and workspace access
- protected folder PIN verification
- payment webhook verification
- session invalidation
- rate limiting
- audit log creation and retention
- malicious or unsupported upload blocking
