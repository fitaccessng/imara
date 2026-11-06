# DEVELOPMENT ROADMAP

## Phase 1 — Foundation and secure auth
### Features
- user registration and email verification
- login/logout/session revocation
- password reset and account recovery
- personal workspace creation
- storage accounting scaffolding
- PostgreSQL schema and Prisma setup
### Frontend pages
- public marketing pages
- login, register, reset, verify pages
- onboarding and first dashboard
### Backend modules
- Authentication, Users, Profiles, Workspaces, Session Management, Email, Audit Logs
### API endpoints
- auth, users, workspaces, basic session management
### Database changes
- User, Profile, Session, Workspace, membership tables
### External integrations
- PostgreSQL, SMTP, Redis, object storage gateway stub
### Acceptance criteria
- user can sign up and verify email
- user can log in and access their workspace
- data is logged and auditable
### Testing
- unit tests for auth and session flows
- integration tests for registration/login and workspace creation

## Phase 2 — Core storage engine
### Features
- private file upload and download
- folder hierarchy and nested structure
- trash, restore, deletion, and quota accounting
- storage reservations and reconciliation
### Frontend pages
- dashboard, file browser, folder detail, upload manager, storage overview
### Backend modules
- Files, Folders, Upload Sessions, Storage, File Versions, Search
### API endpoints
- file/folder CRUD, upload sessions, version listing
### Database changes
- Folder, File, UploadSession, FileVersion, StorageUsageSnapshot
### External integrations
- S3-compatible object storage and queue service
### Acceptance criteria
- upload quota is enforced accurately
- file list and folder tree render correctly
- versions and soft-delete flows work

## Phase 3 — Collaboration and sharing
### Features
- share links, expiration, password protection
- shared-with-me and shared-by-me flows
- team workspaces and member invites
- business workspace management and permissions
### Frontend pages
- sharing modal, recpient-facing share view, team management, business dashboard
### Backend modules
- Sharing, Business Collaboration, Workspace Members, Roles and Permissions, Notifications
### Acceptance criteria
- one user can share a file or folder to another user or public link
- roles and permissions are enforced consistently

## Phase 4 — Document preview, editing, and OCR
### Features
- improve DOCX/PPTX editing fidelity beyond the current lightweight text editor
- PDF preview and annotation
- scanner and OCR
- image enhancement and PDF export
### Frontend pages
- document workspace surfaces, scanner screens, PDF annotation UI
### Backend modules
- Document Preview, Document Editing, PDF, Scanner, OCR, Image Processing, Document Conversion
### Acceptance criteria
- supported files render correctly
- OCR and scan pages can be saved into workspace

## Phase 5 — Billing, subscriptions, and admin
### Features
- plan catalog, checkout, renewals, downgrades, invoices
- admin user and storage management
- audit logs, system health, usage analytics
### Frontend pages
- pricing, checkout, billing, admin dashboards
### Backend modules
- Plans, Subscription, Invoices, Billing, Payments, Admin, Analytics, System Health
### Acceptance criteria
- subscription lifecycle works without manual intervention
- admin can monitor storage and users

## Phase 6 — Hardening and scale
### Features
- advanced security monitoring, rate limiting, event replay, disaster recovery, and observability
### Acceptance criteria
- service health, alerts, and event logs are operational
