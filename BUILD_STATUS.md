# IMARA build status

## Completed

- Phase 1 repository foundation: npm workspaces, React/Vite web app, NestJS API, and
  local PostgreSQL Compose service
- Prisma schema, initial migration and Free subscription seed behavior
- Registration, login, logout, email verification/resend, password recovery/reset, and
  password change
- Argon2id password hashing, hashed one-time email tokens, HttpOnly cookie sessions,
  session listing/revocation, and password-change session revocation
- Profile updates, storage/subscription response, and initial dashboard summary
- Responsive public pages, account settings, login/register/recovery/verification
  routes, protected dashboard, and backend-connected session management
- Setup instructions and API contract documentation
- Phase 2 private file library backed by the persistent HivePod filesystem by default,
  with an optional S3-compatible DockHive Hive Buckets driver:
  authenticated upload/download/delete, persisted metadata, and folder create/rename/delete
- Atomic PostgreSQL quota reservations and accounting for used, in-flight, and available
  storage; dashboard counts now reflect saved files
- Authenticated object streaming with private attachment headers, per-user ownership
  checks, per-file upload size limits, and upload rate limiting

## Not implemented

- File preview/editing, document conversion, scanner/OCR, sharing/collaboration, paid
  plans/payments, workspaces/teams, notifications, and admin tools
- Automated background cleanup/monitoring for stale provider objects; stale quota
  reservations are recovered lazily during a later upload

## External configuration required

- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) for
  registration, verification, resend, and password recovery
- PostgreSQL (`DATABASE_URL`) for persisted API operation
- Persistent HivePod storage (`OBJECT_STORAGE_DRIVER=hivepod`,
  `HIVEPOD_STORAGE_DIR=/data/imara`) for production file operations; the storage path
  must be mounted as persistent, readable, and writable pod storage

## Validation

- Frontend production build and TypeScript check: passed
- Registration and login client-side validation exercised in the browser
- Responsive registration view checked at mobile width
- Backend tests: 5 suites, 10 tests passed
- Root workspace production build and TypeScript checks: passed after Phase 2
- Prisma client generation and schema validation: passed
- Live PostgreSQL migration, HivePod mount connectivity, and upload/download flow:
  not tested because the deployment mount was not available in this environment
- No live registration/login browser flow or end-to-end test was run because the API's
  PostgreSQL and SMTP services were not available.
- Live PostgreSQL migration and SMTP delivery: not tested. The Docker daemon was
  unavailable and port 5432 was already occupied by an existing local PostgreSQL
  process, so the existing database was left untouched.

## Known environment caveat

The backend declares Node.js `22.22.3+`, `24.15+`, or `26+`. The implementation
environment was Node 24.14, below that declared engine range, although the reported
build and tests passed.

## Next milestone

Add file preview/editing and document processing only after deciding the security and
retention requirements for those workflows.
