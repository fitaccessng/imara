# BACKEND ARCHITECTURE

## Architectural principles
- Standalone NestJS modules with clear ownership boundaries
- Use Prisma as the source of truth for relational data
- Keep large binary objects outside PostgreSQL and in S3-compatible storage
- Enforce authorization at the application boundary, never only in the browser
- Use background jobs for file validation, document conversion, OCR, and billing workflows
- Separate read models, write models, queue workers, and external provider clients

## Shared application layers
- API layer: controllers, DTO validation, route guards, global interceptors
- Service layer: core domain logic for files, storage, billing, sharing, security
- Persistence layer: Prisma models and repositories
- Infrastructure layer: object storage, email, payment providers, OCR, queue interface
- Worker layer: scheduled jobs and event-driven handlers

## Core domain model
- Identity and access state live in `User`, `Session`, `Profile`, and `WorkspaceMember`
- File system state lives in `Workspace`, `Folder`, `File`, `FileVersion`, and `UploadSession`
- Billing and access entitlement live in `Plan`, `Subscription`, `Invoice`, and `Payment`
- Security and compliance live in `AuditLog`, `Notification`, and `WebhookEvent`

## Required service boundaries
1. Authentication and session management
2. User and profile management
3. Workspace and collaborative ownership
4. File and folder lifecycle management
5. Storage usage and quota enforcement
6. Sharing, permissions, and folder security
7. Document preview, editing, conversion, and OCR flows
8. Payments, subscriptions, invoices, and billing
9. Admin, audit, analytics, and system health

## Module design notes
Each module should expose domain-specific controllers, DTOs, services, and Prisma interaction logic. Most modules also require a clear event contract for notifications and audit events. The application should not allow modules to directly mutate cross-domain state without an explicit service call or transactional boundary.

## Storage and file architecture
- File metadata stored in PostgreSQL
- Binary payload stored in object storage with signed URLs
- Storage quota tracked at workspace/user level with reconciliation worker
- File deletion should be soft-delete first and permanent cleanup later
- File validation prior to object persistence prevents harmful uploads

## System interactions
- Browser UI sends state changes through HTTP APIs
- API layer validates requests and authorizes actions
- Postgres stores relational metadata and audit events
- Redis/BullMQ handles async tasks such as OCR and conversion
- Object storage stores raw blobs and generated preview artifacts
