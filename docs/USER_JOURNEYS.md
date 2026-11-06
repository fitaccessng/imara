# USER JOURNEYS AND WORKFLOWS

## 1. New user registration and onboarding
User action: visiting the app, creating an account, verifying email, setting profile data, selecting plan, and creating a workspace.
Frontend page: `/register`, `/verify-email`, `/onboarding`, `/plans`, `/dashboard`.
API request: `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-email`, `POST /api/v1/workspaces`, `GET /api/v1/subscriptions/plans`.
Backend processing: create User and Profile, hash password, create email verification token, send email, create default personal workspace.
Database changes: insert User, Profile, Workspace, WorkspaceMember, Notification, AuditLog.
Expected result: active verified account and first workspace created.

## 2. Login and dashboard access
User action: sign in with email/password and land on the dashboard.
Frontend page: `/login`, `/dashboard`.
API request: `POST /api/v1/auth/login`, `GET /api/v1/users/me`.
Backend processing: verify credentials, issue session, read quota and workspace summary.
Expected result: user sees dashboard and active workspaces.

## 3. Creating folders and subfolders
User action: create root or nested folders.
Frontend page: `/dashboard/my-folders` or folder detail panel.
API request: `POST /api/v1/folders` and `GET /api/v1/folders/:id/contents`.
Backend processing: validate workspace access, create folder row, update path metadata, maybe create default permissions.
Database changes: insert Folder and associated permission records.
Expected result: new folder appears in tree and file browser.

## 4. Uploading one or multiple files
User action: drag-and-drop or browse for files and upload.
Frontend page: `/dashboard/upload-manager` and target folder page.
API request: `POST /api/v1/files/upload/initiate`, final complete upload call, then `GET /api/v1/files`.
Backend processing: reserve storage, validate file type and malware, upload blob, create File and metadata records.
Background processing: malware scanning, thumbnail generation, OCR queue when applicable.
Expected result: file appears in user storage and storage ledger updates.

## 5. Downloading files
User action: download one or multiple files.
Frontend page: `/dashboard/my-files` or file detail.
API request: `GET /api/v1/files/:id/download`.
Backend processing: authorize user, generate signed URL, record access log, enforce entitlement.
Expected result: secure file download with minimal exposure.

## 6. Searching for files
User flow: search by name, text, modified date, or folder scope.
Frontend page: `/dashboard/search-results`.
API request: `GET /api/v1/search`, `GET /api/v1/search/files`.
Backend processing: query metadata and full-text indexes, filter by permissions and scope.
Expected result: ranked results with file type icons and paths.

## 7. Moving and organizing documents
User action: drag files and folders to new destinations.
Frontend page: folder tree and file browser.
API request: `POST /api/v1/files/:id/move`, `POST /api/v1/folders/:id/move`.
Backend processing: validate destination permissions and folder ownership.
Expected result: object metadata updated, folder path reindexed.

## 8. Locking and unlocking folders
User action: protect sensitive folder with PIN and lock/unlock access.
Frontend page: folder detail and folder security dialog.
API request: `POST /api/v1/folders/:id/lock`, `POST /api/v1/folders/:id/pin`, `POST /api/v1/folders/:id/pin/verify`.
Backend processing: hash and compare PIN, update lock state, enforce access denial if unverified.
Expected result: protected folder requires verification before access.

## 9. Viewing and editing documents
User action: open a compatible file or trigger document editor.
Frontend page: document workspace shell.
API request: `POST /api/v1/documents/:id/preview`, `POST /api/v1/documents/:id/save`.
Backend processing: map file to preview engine, create conversion tasks, save revisions with version tracking.
Expected result: view/edit flow works or falls back to unsupported preview.

## 10. Scanning physical documents
User action: scan paper documents from camera, crop, rotate, and OCR.
Frontend page: scanner workflow screens.
API request: `POST /api/v1/scanner/session`, `POST /api/v1/scanner/upload`, `POST /api/v1/scanner/ocr`.
Backend processing: capture page images, normalize orientation, dispatch OCR worker, combine multi-page output.
Expected result: PDF or image document saved into target folder.

## 11. Sharing files
User action: create a file share link or set user-specific permissions.
Frontend page: share modal and share settings page.
API request: `POST /api/v1/shares` and `PATCH /api/v1/shares/:id`.
Backend processing: create share token, verify expiration, enforce access rights, optionally store password hash.
Expected result: recipient can access public or recipient-only shared content with correct conditions.

## 12. Upgrading subscriptions
User action: pick a paid plan and complete checkout.
Frontend page: `/pricing`, `/checkout`, `/billing`.
API request: `GET /api/v1/subscriptions/plans`, `POST /api/v1/payments/initiate`, `POST /api/v1/payments/verify`.
Backend processing: validate checkout, record payment, update subscription status, grant entitlements.
Expected result: user receives upgraded plan features and billing record.

## 13. Handling subscription expiry
User action: sees warning, usage is reduced, and renewal is required.
Frontend page: `/billing` and `/plans`.
API request: `GET /api/v1/subscriptions/me`, `POST /api/v1/subscriptions/renew`.
Backend processing: detect expiry, suspend premium features, apply downgrade logic, send alerts.
Expected result: plan is downgraded or renewed according to policy.

## 14. Managing business workspaces
User action: create and manage a business account and its members.
Frontend page: business dashboard and workspace overview.
API request: `POST /api/v1/workspaces`, `GET /api/v1/workspaces/:id/members`, `PATCH /api/v1/workspaces/:id/members/:memberId`.
Backend processing: enforce role permissions, maintain workspace-level quota, update access matrix.
Expected result: shared workspace launches with correct member access.

## 15. Inviting team members
User action: invite teammates to the workspace.
Frontend page: team management screen.
API request: `POST /api/v1/workspaces/:id/members`.
Backend processing: generate invite, email, verify membership role, record audit.
Expected result: member receives invitation and joins with assigned permissions.

## 16. Managing user account settings
User action: update profile, security details, and notifications.
Frontend page: `/settings/profile`, `/settings/security`, `/settings/notifications`.
API request: `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/password`, `GET /api/v1/users/me`.
Backend processing: validate password change, update profile, log security action.
Expected result: user settings persist and session security is maintained.

## 17. Administering the platform
User action: monitor usage, suspend accounts, and manage the platform.
Frontend page: admin dashboard.
API request: `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id/suspend`, `GET /api/v1/admin/storage`.
Backend processing: admin authorization, platform analytics, audit retrieval, security event monitoring.
Expected result: platform operations remain controlled and auditable.
