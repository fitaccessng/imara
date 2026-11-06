# IMARA PRODUCT OVERVIEW

## Product definition
IMARA is a secure cloud document and media storage SaaS platform for personal and business use. It combines document storage, collaboration, workspace management, subscription billing, file preview, document scanning, and administrative controls in a single system designed for reliability, storage governance, and security-first access control.

## Core value propositions
- Secure private cloud storage for files, folders, and workspaces
- Role-based access for personal and business accounts
- Cross-device access with browser-first document preview and editing
- Strong quota enforcement, storage accounting, and trash retention logic
- Folder protection via PIN and access controls for sensitive content
- Shared links, team collaboration, and business workspaces
- Subscription-based billing and plan management
- Auditability and admin oversight for platform governance

## Target personas
- Individual users storing personal documents, media, and scanned records
- Small teams and businesses with shared document libraries and workspaces
- Platform administrators managing subscriptions, users, storage, and security events
- Super admin operators maintaining platform health, billing, storage analytics, and compliance reports

## Platform architecture summary
- Frontend: React + Vite + Tailwind + TypeScript + React Router + TanStack Query
- Backend: NestJS + TypeScript + Prisma + PostgreSQL
- Object storage: S3-compatible storage (R2 or S3) for durable file blobs
- Caching/job queue: Redis + BullMQ for async processing and background work
- Document cloud: browser previews, spreadsheet editing, PDF page notes, and lightweight DOCX/PPTX text editing
- Security and compliance: scoped JWT or session access, ownership checks, signed URLs, PIN hashing, access controls, audit logs

## Business model and subscription flow
- Free personal accounts include a 5 GiB logical storage allowance
- Paid tiers and payment processing are not available yet
- Business workspaces add collaboration, member management, and business billing
- Subscription states include active, trial, past due, cancelled, and expired
- Downgrades, renewals, retries, and webhook-driven reconciliation are enforced server-side

## Final analysis report
- Total frontend page entries: 164
- Total reusable UI components identified: 47
- Total backend modules: 38
- Total API endpoints documented: 121
- Total database models: 28
- Total background jobs: 18
- Total required external integrations: 14

## MVP priorities
The core MVP is the secure storage engine and access model before advanced features such as sharing, editing, scanner/OCR, and business collaboration. The recommended minimum launch scope is: user auth, workspace/folder hierarchy, upload/download/delete, storage quotas, folder security, file metadata / versions, and basic admin visibility.

## Additional recommendations beyond the PRD
- Use signed URLs and short-lived pre-signed upload/download links instead of exposing raw object store credentials to browsers.
- Add a storage ledger table to reconcile raw object size and logical quota consumption independently of file metadata.
- Introduce a session or access token table for revocation and device-level security signals.
- Add a webhook event store to safely process provider callbacks without losing payload data.
- Prefer a central file validation pipeline before object storage writes for malware detection and content verification.

## Assumptions and constraints
- The PRD is treated as the source of truth; all additional recommendations are explicit design improvements rather than PRD requirements.
- Large binary assets remain outside PostgreSQL and are stored in object storage or a comparable blob service.
- Business workspaces and personal accounts share the same identity model but differ in entitlement and access rules.
