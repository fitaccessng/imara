# IMARA API (Phases 1 and 2)

NestJS + TypeScript API using PostgreSQL/Prisma. All routes are prefixed with `/api/v1`.
The API is part of the IMARA npm workspace. The repository root provides the web app,
workspace scripts, and a Docker Compose PostgreSQL service.

## Requirements and local setup

- Node.js 22.22.3+, 24.15+, or 26+ and npm (Nest CLI/schematics engine range)
- PostgreSQL 14+ (create an empty database named `imara`)
- An SMTP account for registration, verification, and password reset email

From the repository root, install the workspaces, copy the environment templates, and
start PostgreSQL:

```sh
npm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
npm run prisma:generate -w @imara/api
npm run prisma:deploy -w @imara/api
npm run dev:api
```

In another terminal, run the web app with `npm run dev`. The example API database URL
matches the root Compose service. SMTP values in `apps/api/.env` are required for
registration, verification and password-recovery email.
The example config contains the Brevo relay, SMTP login, and verified sender address.
Set the SMTP key only as `SMTP_PASSWORD` in the ignored `apps/api/.env` or your deployment
secret manager; rotate any SMTP key that has been shared in chat or source control.
The API loads `apps/api/.env` when started from the repository root with `npm run dev:api`.
After changing SMTP settings, restart the API process so it picks up the new values.
For managed PostgreSQL with a private TLS certificate authority, set `DATABASE_SSL_CA`
to the CA's PEM certificate in the deployment secret manager. The API and seed command
use it to verify the database certificate and hostname; do not disable certificate checks.

The API listens on `http://localhost:3001`. Use `npm run build -w @imara/api` and
`npm test -w @imara/api` for validation. For schema development,
`npm run prisma:migrate -w @imara/api -- --name add_feature`
creates a migration; commit the generated migration, then use
`npm run prisma:deploy -w @imara/api` for deployment.
`npm run prisma:seed -w @imara/api` only checks the connection; no demo user or
credentials are created.

## Platform administrator access

There is no public administrator registration URL. An operator can create a
separate platform-admin account from an interactive terminal connected to the
intended database. The password is entered invisibly at the prompt and is never
accepted as a command-line argument:

```sh
npm run prisma:deploy -w @imara/api
npm run admin:create -w @imara/api -- --email 'admin@useimara.space' --name 'IMARA Admin'
```

The creation command requires a TTY, requires a unique email, validates and hashes
the password, and creates a separate administrator identity with its own Free-tier
subscription. For an existing verified user, operators can instead use
`npm run admin:promote -w @imara/api -- --email 'verified-user@example.com'`.
Both commands atomically ensure a `UserRole.ADMIN` user and an active
`PlatformAdminProfile` with the `SUPER_ADMIN` role. Neither command creates a
public role-change endpoint. Administrators sign in separately at `/admin/login`;
the API checks the current database session, `UserRole.ADMIN`, and an active
platform-admin profile. Client-supplied role claims are never authorization.

Platform-admin permissions are server-side and default-deny. Roles are
`SUPER_ADMIN`, `USER_MANAGEMENT_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`,
`MARKETING_ADMIN`, `OPERATIONS_ADMIN`, and `SECURITY_ADMIN`; only `SUPER_ADMIN`
bypasses the domain permission catalog. Permissions are assigned by domain:
overview read is available to every role; user and business access, customer
status/session/credential-recovery controls, storage, events, analytics, and audit logs
are granted only to the roles defined in `src/admin/platform-admin.permissions.ts`. The
`20261108060000_platform_admin_permissions_audit` migration explicitly
backfills users already marked `UserRole.ADMIN` as active `SUPER_ADMIN`
profiles, preserving their access while retaining `UserRole.ADMIN` as a second
authorization gate. Apply migrations and regenerate Prisma Client before
deploying the API:

```sh
npm run prisma:generate -w @imara/api
npm run prisma:deploy -w @imara/api
```

### Platform-admin API

All routes require an authenticated platform-admin session. Except `/me`,
each route also requires its domain permission and writes to the separate
`PlatformAdminAuditLog` table. Read routes audit before returning data;
customer status/session mutations commit their audit row in the same database
transaction as the change. Workspace `AuditLog` records remain separate.
Paginated directories support `page` (1 through 1,000,000), `pageSize` (1–100,
default 25), and trimmed `q` searches (maximum 100 characters). Audit records
also support exact `action` and `resourceType` filters. List responses use
`{items, page:{page,pageSize,totalItems,totalPages}}`. Storage byte values are
decimal strings.

| Method | Route | Response shape |
|---|---|---|
| GET | `/api/v1/admin/me` | `{id,email,name,emailVerified,role:'ADMIN',platformAdminRole}` |
| GET | `/api/v1/admin/overview` | `{counts:{users,verifiedUsers,plans:{FREE,PRO,BUSINESS},workspaces,members,files,storageBytes,events,eventMedia,eventMediaStorageBytes},recentRegistrations:[{id,email,name,createdAt}]}` |
| GET | `/api/v1/admin/users` | Paginated safe user directory including account status and optional subscription plan |
| GET | `/api/v1/admin/users/:id` | Account, subscription quota, business memberships, aggregate file/event metadata, recent sign-in history, and safe active-session metadata; payment history and ticket counts are included only for roles with the corresponding permission; no file content or session tokens |
| PATCH | `/api/v1/admin/users/:id/status` | Set `ACTIVE` or `SUSPENDED`; suspension revokes active sessions; reactivation does not restore them |
| POST | `/api/v1/admin/users/:id/password-reset` | Audits the request and emails the existing six-digit password reset code |
| POST | `/api/v1/admin/users/:id/verification-email` | Audits the request and resends a verification code only when the customer is still unverified |
| DELETE | `/api/v1/admin/users/:userId/sessions/:sessionId` | Revoke one active customer session |
| GET | `/api/v1/admin/businesses` or `/api/v1/admin/workspaces` | Paginated workspace directory: workspace id/name/date, owner id/name/email, memberCount, and used/limit storage |
| GET | `/api/v1/admin/businesses/:id` or `/api/v1/admin/workspaces/:id` | Workspace, owner, member roles/status, and storage/file/folder/event counts; no document content |
| GET | `/api/v1/admin/plans` | Current configurable plan catalogue |
| PATCH | `/api/v1/admin/plans/:plan` | Update plan price, limits, and entitlements with an audit record |
| GET | `/api/v1/admin/subscriptions` | Paginated subscription records and plan/status metadata |
| GET | `/api/v1/admin/payments` | Paginated payment attempts and server-verified successful receipts, summarized by currency |
| GET | `/api/v1/admin/storage-inventory` | Ready-file count/bytes, largest uploader accounts/workspaces, and MIME-type aggregates; no filenames |
| GET | `/api/v1/admin/upload-monitoring` | Persisted upload/deletion states, stale operation count, source counts (including scan uploads), and MIME-type aggregates |
| GET | `/api/v1/admin/system-health` | Live database, configured object-storage driver and SMTP checks; reports backup/OCR/malware scanning as not integrated |
| GET | `/api/v1/admin/announcements` | Paginated announcement history with audience, recipients, and email delivery counts |
| POST | `/api/v1/admin/announcements` | Creates audited in-app deliveries for active customers and optionally queues SMTP emails by plan audience |
| POST | `/api/v1/admin/announcements/:id/retry-email` | Re-queues failed SMTP deliveries for an announcement and writes an audit record |
| GET | `/api/v1/admin/support-tickets` | Paginated support queue filtered by customer/subject, status, or priority |
| GET | `/api/v1/admin/support-agents` | Active platform administrators eligible for ticket assignment |
| GET | `/api/v1/admin/support-tickets/:id` | Audited ticket conversation, including administrator-only internal notes |
| PATCH | `/api/v1/admin/support-tickets/:id` | Audited status, priority, and assigned-agent update |
| POST | `/api/v1/admin/support-tickets/:id/messages` | Audited in-app customer reply or administrator-only internal note |
| GET | `/api/v1/admin/events` | Paginated event metadata with stored status, gallery setting, owner, and workspace; supports `q`, `status`, and `gallerySetting` |
| GET | `/api/v1/admin/analytics` | UTC registration counts by day and stored subscription distribution; accepts ISO `from` and `to` (end exclusive, max 366 days) |
| GET | `/api/v1/admin/audit-logs` | Paginated platform-admin audit records with actor, action, resource, metadata, IP, user agent, and timestamp |

Overview values come from persisted user, subscription, workspace, member,
stored-file, and event records. File/storage counts include ready files only;
event-media values include ready event-linked files. Announcement delivery is
persisted per active customer; in-app messages are available at
`GET /api/v1/announcements` and can be marked read at
`POST /api/v1/announcements/:id/read`. Optional SMTP delivery is processed from
a database-backed queue in batches and exposes pending/sent/failed status. A
crash after an SMTP provider accepts a message but before its status is saved
can result in a duplicate on recovery; SMTP cannot provide exactly-once
delivery. Failed messages are not retried automatically; an authorised admin
can explicitly queue failed deliveries again.

Customers can create tickets at `POST /api/v1/support/tickets`, list their own
requests at `GET /api/v1/support/tickets`, view their public conversation at
`GET /api/v1/support/tickets/:id`, and reply at
`POST /api/v1/support/tickets/:id/messages`. Internal notes are excluded from
all customer responses. Replies appear in the signed-in support view; ticket
email notifications are not configured.

Upload monitoring uses persisted file state and the upload source marker. It
does not invent historical failures or processing outcomes. The health page
performs live database and object-store checks plus SMTP configuration
verification; it never exposes credentials. IMARA does not currently have a
backup, OCR, document-conversion, or malware-scanning integration, so these are
reported as not integrated. Editable runtime platform settings are not implemented.
Bachs hosted checkout and signed webhook verification are integrated; the admin
payment views report persisted, provider-confirmed one-time receipts by currency.
Refund processing, provider-fee reconciliation, and automatic renewal are not
implemented, so recurring revenue and MRR are not inferred.
DAU and churn are not inferred from plan or account records. Event status only
supports the persisted `ACTIVE` and `DELETING` values; completion/cancellation
is not inferred from the event date. Admin responses do not expose document
names or contents, passwords, session tokens, or request bodies.

`CORS_ORIGINS` is a comma-separated exact-origin allowlist and defaults to the Vite
origin `http://localhost:5173`. Browser requests must use credentials
(`fetch(..., { credentials: 'include' })`). The API also rejects disallowed `Origin`
headers on requests. In production set `COOKIE_SECURE=true`, use HTTPS, use a
production frontend origin, and keep SMTP/database secrets outside source control.
Production defaults to `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true` so the
session cookie is sent when the frontend and API are on different sites. Override
this with `COOKIE_SAME_SITE=lax` only when both are hosted on the same site.

## Calendar reminders and browser push

Personal and workspace calendar events accept an optional `reminderMinutesBefore`
choice of `0`, `5`, `15`, `30`, `60`, or `1440` minutes; `null` disables it. Workspace events also
accept `taggedUserIds`, but the API stores tags only after verifying every ID is
an active member of that workspace. Omit the field to retain existing tags and
send an empty array to clear them. The creator receives workspace reminders
alongside tagged active members. Personal events always notify only their owner.

Existing create/update routes are unchanged:

- `POST /api/v1/calendar/events` and `PATCH /api/v1/calendar/events/:eventId`
- `POST /api/v1/workspaces/:workspaceId/calendar/events` and
  `PATCH /api/v1/workspaces/:workspaceId/calendar/events/:eventId`

The event response includes `reminderMinutesBefore`, `taggedUserIds: string[]`,
and `taggedUsers: [{ id, name, email }]` (only active workspace tags are returned).
Delivery is persisted and polled by the API worker.
Edits to start time, reminder time or workspace tags cancel unsent prior work
and schedule a fresh revision; deleting the event cascades queued work. Database
uniqueness and notification source keys prevent duplicate queue/notification
records. Email delivery is retried and is therefore at-least-once in the unlikely
case a provider accepts a message but its acknowledgement is lost.

Apply the new migration before starting updated API instances:
`npm run prisma:deploy -w @imara/api`. It adds nullable reminder scheduling
columns, recipient/dispatch/tag tables, a personal-notification source key, and
nullable notification workspace scope.
Existing calendar events remain without reminders.

The worker sends email through the existing SMTP configuration, writes an
in-app `Notification`. Browser push is not enabled; reminders use email and
in-app notifications only.
`CALENDAR_REMINDER_DELIVERY_INTERVAL_MS` optionally adjusts the polling interval
(default 30000ms; minimum 1000ms).

Authenticated frontend contracts:

- `GET /api/v1/notifications` lists the signed-in user's personal-event notifications;
  `POST /api/v1/notifications/:notificationId/read` marks one as read.
- Workspace-event notifications remain at
  `GET /api/v1/workspaces/:workspaceId/notifications` and
  `POST /api/v1/workspaces/:workspaceId/notifications/:notificationId/read`.

## Bachs plan payments

Paid plans use Bachs hosted checkout with NGN one-time payments. A confirmed
payment grants one calendar month of the selected plan; it does not auto-renew.
The API only activates access from a signed `collection.succeeded` webhook and
checks the exact amount and currency against the saved checkout attempt. Expired
paid plans revert to Free on the account's next authenticated API request.

Configure `BACHS_MODE=sandbox`, a sandbox `BACHS_API_KEY`, and
`BACHS_WEBHOOK_SECRET` in the API environment. Set `BACHS_FRONTEND_URL` to a
public HTTPS URL (an HTTPS tunnel is needed for local checkout; Bachs rejects
localhost return URLs). Register `POST https://<api-host>/api/v1/billing/webhook`
in the Bachs developer portal and subscribe to `collection.succeeded` and
`checkout.expired`. Start with sandbox keys and switch to `BACHS_MODE=live`
and an `sk_live_` key only after testing and verifying the Bachs account.

Email is not simulated. Registration, resend-verification and forgot-password return
503 until all SMTP variables are supplied. A configured but failing SMTP service will
also return 503. Email verification and password recovery use six-digit, single-use
codes with a configurable 10-minute expiry, up to five attempts per code, and SHA-256
digests stored in the database. Legacy verification and reset links remain accepted.
Invitation tokens are random, single-use, time-limited, and stored only as SHA-256 digests.
Operational delivery retry/queueing for authentication email is not
implemented. Platform-announcement emails use a separate persisted queue and
delivery status.

## Object storage configuration

The production HivePod storage driver sends objects over authenticated HTTPS to
the storage service running on the `imara-documents` pod. Set
`OBJECT_STORAGE_DRIVER=hivepod`, `HIVEPOD_STORAGE_URL` to that pod's exposed
HTTPS address, and `HIVEPOD_STORAGE_TOKEN` to the same random 32-byte hex token
configured on the pod. The service stores data under
`/home/hivepod/data/imara-storage/objects`, which is on the pod's persistent
volume. Install `hivepod-storage-server.py` and `hivepod-storage-run.sh` in
`/home/hivepod/data/imara-storage` on the pod, set its startup command to
`sh /home/hivepod/data/imara-storage/run.sh`, configure `PORT=8080` and the
shared token there, apply the changes, and expose port 8080 over HTTPS. Health
checks verify the authenticated storage service is reachable.
Set `HIVEPOD_STORAGE_MAX_BYTES` to at least `524288000` (500 MiB) on the
storage pod. This is the platform ceiling; plan limits are enforced by the API:
Free 100 MiB, Pro 250 MiB, and Business 500 MiB per file.

The optional `OBJECT_STORAGE_DRIVER=s3` uses DockHive Hive Buckets through the
S3-compatible API. Configure `DOCKHIVE_S3_ENDPOINT`, `DOCKHIVE_BUCKET`,
`DOCKHIVE_ACCESS_KEY_ID`, and `DOCKHIVE_SECRET_ACCESS_KEY` from your DockHive
account. `DOCKHIVE_S3_REGION` defaults to `auto` and
`DOCKHIVE_S3_FORCE_PATH_STYLE` defaults to `true`. Production requires an HTTPS
endpoint. Keep provider credentials in untracked environment files or the
hosting provider's secret manager.

For development and tests, `OBJECT_STORAGE_DRIVER=local` stores files beneath
`OBJECT_STORAGE_LOCAL_DIR` and is rejected in production. Upload/download/delete
return 503 when the selected storage is not configured or available.

Uploads are proxied through the API using private temporary disk files (not whole-file
memory buffers), streamed to object storage, and limited per file by the uploading
account's plan: Free 100 MiB, Pro 250 MiB, and Business 500 MiB. The multipart parser
has a 500 MiB platform ceiling. Configure `IMARA_UPLOAD_TMP_DIR` if the OS temp volume
is too small; keep it private and provision enough free disk for concurrent uploads.
Aborted and completed requests remove temporary files. File-size rejection returns 413
with `plan`, decimal-string `maxUploadBytes`, `message`, and `upgradeMessage` fields.
The subscription response exposes `storage.maxUploadBytes`; the dashboard exposes it
at `subscription.storage.maxUploadBytes`. Event capture preflight uses the event owner's
plan and exposes decimal-string `maxUploadBytes` from
`GET /api/v1/events/capture/:token`. Workspace uploads enforce the uploader's per-file
limit and the owner's overall workspace storage quota. The API also enforces a single
file per request and rate-limits upload routes. Random user-scoped object keys are used;
filenames and MIME types are metadata only and are never used to construct object keys.
Downloads are private, authenticated attachments and are sent with `nosniff`. Do not
expose the bucket publicly.

Before sending an object, the API atomically reserves quota in PostgreSQL. Successful
uploads convert that reservation to used bytes; failed operations release it. Stale
upload/delete records older than one hour are recovered lazily on the user's next upload.
Until recovery succeeds, reserved bytes remain unavailable rather than risking a quota
overrun. This is not a substitute for provider-side lifecycle rules or monitoring.

## API contract

JSON request bodies are validated; unknown fields are rejected. Passwords require
12–128 characters. Email addresses are lowercased before lookup. Authentication
uses an opaque server-side session in an HttpOnly cookie; the raw session value is
never stored in PostgreSQL. Logout, password reset, and password change revoke
sessions. Sensitive auth endpoints are rate-limited (global default 100/minute, with
stricter per-route limits).

| Method | Route | Request / response |
|---|---|---|
| POST | `/api/v1/auth/register` | `{email,password,name}` → 201 `{id,email,name,emailVerified}`; requires SMTP |
| POST | `/api/v1/auth/login` | `{email,password}` → 200 `{user:{id,email,name,emailVerified,role}}`; sets session cookie |
| GET | `/api/v1/admin/me` | Authenticated platform administrator → `{id,email,name,emailVerified,role:'ADMIN'}`; checks the current database role |
| POST | `/api/v1/auth/logout` | Authenticated → 204, revokes current session and clears cookie |
| GET | `/api/v1/auth/me` | Authenticated → `{id,email,name,emailVerified,role,createdAt}` |
| POST | `/api/v1/auth/verify-email` | `{token}` → 204 |
| POST | `/api/v1/auth/verify-email-code` | `{email,code}` → 204; six-digit code, maximum five attempts |
| POST | `/api/v1/auth/forgot-password` | `{email}` → 202 `{message}`; requires SMTP |
| POST | `/api/v1/auth/reset-password` | `{token,password}` → 204; revokes all sessions |
| POST | `/api/v1/auth/reset-password-code` | `{email,code,password}` → 204; six-digit code, maximum five attempts, revokes all sessions |
| POST | `/api/v1/auth/change-password` | Authenticated `{currentPassword,newPassword}` → 204; revokes all sessions |
| GET/PATCH | `/api/v1/users/me` | Authenticated; GET returns user, PATCH `{name}` → `{id,email,name,emailVerified}` |
| GET | `/api/v1/dashboard/summary` | Authenticated → `{user,subscription,overview}` |
| GET | `/api/v1/subscription` | Authenticated → `{plan,storage:{usedBytes,limitBytes,availableBytes}}` |
| POST | `/api/v1/auth/resend-verification` | `{email}` → 202 `{message}`; requires SMTP |
| GET | `/api/v1/auth/sessions` | Authenticated → `{sessions:[{id,current,createdAt,lastSeenAt,userAgent?}]}` |
| DELETE | `/api/v1/auth/sessions/:id` | Authenticated → 204; revokes only this user's session; revoking current clears its cookie |
| GET | `/api/v1/files?folderId=<uuid>` | Authenticated → `{folderId,folders,files}` for root or one owned folder; omit `folderId` for root |
| POST | `/api/v1/files` | Authenticated multipart form with `file` and optional UUID `folderId` → 201 file metadata |
| GET | `/api/v1/files/:id/download` | Authenticated attachment download; ownership checked |
| PATCH | `/api/v1/files/:id/content` | Authenticated multipart edited file; extension and quota checked |
| PATCH | `/api/v1/workspaces/:workspaceId/files/:fileId/content` | Workspace edit permission, extension, and quota checked |
| DELETE | `/api/v1/files/:id` | Authenticated, owned file → 204; releases used quota |
| GET | `/api/v1/folders?parentFolderId=<uuid>` | Authenticated → immediate child folders; omit for root |
| GET | `/api/v1/folders/:id` | Authenticated metadata for one owned folder |
| POST | `/api/v1/folders` | `{name,parentFolderId?}` → 201 folder; names are unique in each parent |
| PATCH | `/api/v1/folders/:id` | `{name}` → renamed owned folder |
| DELETE | `/api/v1/folders/:id` | 204 for an empty folder; non-empty folders return 409 |

`lastSeenAt` is refreshed when an authenticated request passes the session guard.
`userAgent` is captured at login when present and truncated to 512 characters.

Compatibility aliases are also available at `/api/v1/profile` (GET/PATCH) and
`/api/v1/dashboard` (GET). The frontend should use `/api/v1/users/me` and
`/api/v1/dashboard/summary`.

Storage values are decimal strings in JSON to preserve PostgreSQL `BIGINT` precision.
The Free plan quota is exactly **5,368,709,120 bytes** (5 GiB). `availableBytes`
subtracts both used and in-progress reserved bytes. The API persists file metadata and
usage counts; object storage is only active after the S3-compatible provider configuration
is supplied. This milestone does not add billing, general file sharing, or scanning.

## Event photo/video collection

Apply the event media migration and regenerate Prisma Client during deployment:

```sh
npm run prisma:generate -w @imara/api
npm run prisma:deploy -w @imara/api
npm run build -w @imara/api
```

Event routes and request/response contracts are listed in
[`docs/API_ENDPOINT_DOCUMENTATION.md`](../../docs/API_ENDPOINT_DOCUMENTATION.md#event-photovideo-collection-implemented).
Organizer event operations use the existing session cookie. Creation defaults gallery
access to `PRIVATE`; optional modes are `LINK_PUBLIC` and `PASSCODE`. Capture and
gallery tokens are generated from 32 random bytes, hashed in PostgreSQL, and returned
only by create/rotate operations. Keep those responses out of application logs and
redact event token paths in reverse-proxy/access logs.

Event uploads are limited to image/video MIME types with matching magic bytes, a single
multipart file, the event owner's 100/250/500 MiB plan limit, and a stricter per-route
throttle. They use the existing private S3-compatible storage, atomic subscription quota
reservations, and a per-event byte cap fixed to subscription quota remaining at event
creation. Event reservations also count against the event cap. Event gallery unlocks
issue 30-minute hashed grants; send the raw grant only in the `Authorization` header.
Rate limiter state is in-process; multi-instance deployments should also enforce
equivalent limits at the trusted ingress and must not trust client-supplied forwarding
headers unless the proxy chain is configured securely.

The backend exposes capture/gallery API URLs; the frontend must place the capture token
in its QR capture-page URL and the gallery token in its share URL. `Authorization` is
allowed by the API CORS policy for gallery grant requests. Object storage must be
configured as described above; upload/download/delete fail explicitly when unavailable.

Typical errors use Nest's JSON error shape (`statusCode`, `message`, `error`).
The frontend receives 401 for missing/invalid sessions, 403 for unverified login or
disallowed origins, 409 for duplicate registration or non-empty folder deletion, 400 for
invalid DTOs, 413 for a file that exceeds its upload limit or remaining quota, 429 for
rate limits, and 503 when email or object storage is unconfigured/unavailable.
