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
Registration accepts syntactically valid addresses on custom domains; there is no
domain allowlist. The SMTP relay must accept the recipient, and its acceptance
does not guarantee inbox placement or delivery by the recipient's mail host.
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

## File requests

Authenticated clients can create a shareable upload request with
`POST /api/v1/file-requests` and list requests with `GET /api/v1/file-requests`.
Creation accepts `{title, message?, destinationFolderId?}` and returns the
one-time bearer `token`; only its hash is stored, so list responses do not
reveal tokens. `DELETE /api/v1/file-requests/:id` revokes a request.

Recipients can read `GET /api/v1/file-requests/public/:token` and upload one
file per `POST /api/v1/file-requests/public/:token/uploads`. Send multipart
field `file`. Folder selection is supported by sending each file separately
and optionally including its `File.webkitRelativePath` in the multipart
`relativePath` field. The path is treated as relative to the request’s chosen
destination folder, including its top-level directory; missing `relativePath`
saves directly into the destination. Absolute paths, traversal segments,
control characters, paths over 2,048 characters, and paths deeper than 20
directories are rejected. The API creates/reuses personal folders for valid
path segments. Uploads use the request creator’s per-file plan limit and
storage quota.

## Personal notes and weekly insights

Personal notes are private to the authenticated user:

- `GET /api/v1/notes?search=...` lists notes and optionally searches titles and bodies.
- `POST /api/v1/notes` creates a note with `{title, body, fileIds?}`.
- `GET /api/v1/notes/:id`, `PATCH /api/v1/notes/:id`, and `DELETE /api/v1/notes/:id`
  read, update, and delete an owned note.
- `fileIds` selects up to 20 existing ready, nondeleted personal files (not
  workspace, event, or file-request uploads). Omit it on update to retain
  attachments; provide an array, including `[]`, to replace or clear them.
  Returned `attachments` include safe file metadata (`id`, `originalName`,
  `mimeType`, decimal-string `sizeBytes`); object keys are never returned.
- Personal tasks use `GET/POST /api/v1/tasks` and
  `PATCH/DELETE /api/v1/tasks/:id`. Create accepts `{title,description?,status?,
  progress?,dueAt?,fileIds?}`; update accepts any of those fields. Status is
  `TODO`, `IN_PROGRESS`, `BLOCKED`, or `DONE`; progress is an integer from 0
  through 100. `dueAt` is an ISO date-time or `null` to clear it. As with notes,
  `fileIds` replaces attachments only when supplied, and attachments must be
  ready, nondeleted personal files owned by the caller. Lists order by due date,
  then most recently updated. Task responses include the same safe attachment
  metadata.
- `GET /api/v1/insights/weekly` reports personal files created in the rolling
  seven-day window, unrevoked file-request links, and ready personal files
  expiring today through 30 days from today.
- `PATCH /api/v1/files/:id/expiry` accepts `{ "expiresAt": "YYYY-MM-DD" }`
  or `{ "expiresAt": null }` to clear the user-managed date. The date is a
  plain UTC calendar day, and the same date-only `expiresAt` value is returned
  in file listings. The file must be
  owned by the caller and be a ready, nondeleted personal file; workspace,
  event, and file-request uploads are not eligible. Expiry dates are never
  inferred from OCR.

The weekly insights response marks upcoming expiry dates as supported and
returns matching personal files in ascending expiry order. SMTP campaign
acceptance is likewise not proof of recipient delivery or inbox placement;
the email studio reports `SMTP_ACCEPTED` only when the SMTP server accepts
the recipient.

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
| POST | `/api/v1/admin/payments/:checkoutId/verify` | Finance-admin-only live Bachs verification; matches checkout, account email, plan amount, and currency before idempotent fulfillment, with request/result audit records |
| GET | `/api/v1/admin/storage-inventory` | Ready-file count/bytes, largest uploader accounts/workspaces, and MIME-type aggregates; no filenames |
| GET | `/api/v1/admin/upload-monitoring` | Persisted upload/deletion states, stale operation count, source counts (including scan uploads), and MIME-type aggregates |
| GET | `/api/v1/admin/system-health` | Live database, configured object-storage driver and SMTP checks; reports external backup/OCR/malware-scanning integrations |
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
a database-backed queue in batches and exposes pending, SMTP-accepted, and
failed status. A crash after an SMTP provider accepts a message but before its
status is saved can result in a duplicate on recovery; SMTP cannot provide
exactly-once delivery. `SMTP_ACCEPTED` records provider acceptance only and
does not confirm delivery, inbox placement, or that a recipient saw the email.
Failed messages are not retried automatically; an authorised admin can
explicitly queue failed deliveries again. Bounce, delivery, and spam-complaint
webhooks are not integrated.

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
backup, external OCR, or malware-scanning integration, so these are reported as
not integrated. Browser-side OCR and document conversion are available in the
web app; conversion may preserve text without preserving original layout.
Editable runtime platform settings are not implemented.
Bachs hosted checkout and signed webhook verification are integrated; the admin
payment views report persisted, provider-confirmed one-time receipts by currency.
Refund processing, provider-fee reconciliation, and automatic renewal are not
implemented, so recurring revenue and MRR are not inferred.
DAU and churn are not inferred from plan or account records. Event status only
supports the persisted `ACTIVE` and `DELETING` values; completion/cancellation
is not inferred from the event date. Admin responses do not expose document
names or contents, passwords, session tokens, or request bodies.

`CORS_ORIGINS` is a comma-separated exact-origin allowlist and defaults to the Vite
origin `http://localhost:5173`. For Expo web development, include the exact local
origin in use, such as `http://localhost:8082`; the example also lists Expo's
common local ports. Browser requests must use credentials
(`fetch(..., { credentials: 'include' })`). The API also rejects disallowed `Origin`
headers on requests.

The deployed API has its own `CORS_ORIGINS` environment setting; changing a local
`.env` or this example does not update the live service. Append the exact Expo
origin to that setting and restart/redeploy the API to enable browser requests.
Do not replace the deployed website origins when adding a development origin.
For production set `COOKIE_SECURE=true`, use HTTPS, use a production frontend
origin, and keep SMTP/database secrets outside source control.
For production, prefer hosting the API on a custom hostname under the frontend's
site (for example `api.useimara.space` for `www.useimara.space`). Configure the
frontend to call that HTTPS hostname, allow the exact frontend origins in
`CORS_ORIGINS`, and set `COOKIE_SECURE=true` with `COOKIE_SAME_SITE=lax`. This keeps
the HttpOnly session cookie first-party while still allowing credentialed API calls.
An Expo page on `localhost` is cross-site from `useimara.space`; enabling CORS alone
may therefore allow the request but not persist the login cookie. Cross-site cookies
require `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`, and still depend on browser
third-party-cookie policies. For reliable web authentication testing, use a
same-site development deployment or the native app.

## Calendar reminders and browser push

Personal and workspace calendar events accept an optional `reminderMinutesBefore`
choice of `0`, `5`, `15`, `30`, `60`, or `1440` minutes; `null` disables it. Workspace events also
accept `taggedUserIds`, but the API stores tags only after verifying every ID is
an active member of that workspace. Omit the field to retain existing tags and
send an empty array to clear them. The creator receives workspace reminders
alongside tagged active members. Personal events always notify only their owner.
When a shared event is created, each tagged member other than the creator receives
an immediate in-app notification and email; the creator is not notified about
their own event. Adding tags notifies only newly tagged members. Meaningful edits
to event details or times notify the currently tagged members. Reminder-only
changes do not resend event notifications.

Existing create/update routes are unchanged:

- `POST /api/v1/calendar/events` and `PATCH /api/v1/calendar/events/:eventId`
- `POST /api/v1/workspaces/:workspaceId/calendar/events` and
  `PATCH /api/v1/workspaces/:workspaceId/calendar/events/:eventId`

The event response includes `reminderMinutesBefore`, `taggedUserIds: string[]`,
and `taggedUsers: [{ id, name, email }]` (only active workspace tags are returned).
Both personal and workspace event create/update payloads also accept optional
`linkedFileId` and `linkedTaskId`; sending `null` clears a link, while omission
retains it on update. Linked documents must be ready, nondeleted files in the
same personal or workspace scope. Linked tasks must belong to the same owner or
workspace. Responses include `linkedFile` safe metadata, `linkedTaskId`, and a
safe `linkedTask` summary (id, title, status, progress, dueAt); absent links are
returned as `null`. Existing reminder settings and notification behavior are
unchanged.
Immediate event notifications and scheduled reminders are persisted as separate
delivery revisions and polled by the API worker. Edits to start time, reminder
time or workspace tags cancel unsent reminder work and schedule a fresh revision;
deleting the event cascades queued work. No-op edits do not resend event
notifications. Database uniqueness and notification source keys prevent duplicate
queue/notification records. Email delivery is retried and is therefore
at-least-once in the unlikely case a provider accepts a message but its
acknowledgement is lost.

Apply pending migrations before starting updated API instances:
`npm run prisma:deploy -w @imara/api`. It adds nullable reminder scheduling
columns, recipient/dispatch/tag tables, event-notification revisions, a personal-
notification source key, and nullable notification workspace scope.
Existing calendar events remain without reminders.

The worker sends email through the existing SMTP configuration and writes
in-app `Notification` records. Browser push is not enabled; calendar notices use
email and in-app notifications only.
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
The API activates access from a signed `collection.succeeded` webhook or a
signed `checkout.completed` webhook with `payment_status: "succeeded"` or
`"paid"`, and checks the exact amount and currency against the saved checkout
attempt. If a webhook is delayed or missed, the authenticated payment-status
route retrieves a still-pending checkout directly from Bachs and applies the
same checks before granting access. Subscribe the Bachs endpoint to both
payment-success events and `checkout.expired`. Expired paid plans revert to
Free on the account's next authenticated API request.
Finance admins and Super Admins can verify an individual checkout from the
admin payment ledger. Verification reads the session directly from Bachs and
requires a completed paid charge, the saved checkout ID, the customer's
account email, and the exact saved amount and currency; it never trusts an
admin-supplied paid status.

Configure `BACHS_MODE=sandbox`, a sandbox `BACHS_API_KEY`, and
`BACHS_WEBHOOK_SECRET` in the API environment. Set `BACHS_FRONTEND_URL` to a
public HTTPS URL (an HTTPS tunnel is needed for local checkout; Bachs rejects
localhost return URLs). Register `POST https://<api-host>/api/v1/billing/webhook`
in the Bachs developer portal and subscribe to `collection.succeeded`,
`checkout.completed`, and `checkout.expired`. Start with sandbox keys and switch
to `BACHS_MODE=live` and an `sk_live_` key only after testing and verifying the
Bachs account.

Email is not simulated. Registration, resend-verification and forgot-password return
503 until all SMTP variables are supplied. A configured but failing SMTP service will
also return 503. Email verification and password recovery use six-digit, single-use
codes with a configurable 10-minute expiry, up to five attempts per code, and SHA-256
digests stored in the database. Administrators can resend an unverified user's
single-use verification link from the user detail page; verification and reset links
are stored as token digests and expire using the configured email-token lifetime.
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
| PATCH | `/api/v1/files/:id/expiry` | Authenticated `{expiresAt:"YYYY-MM-DD"}` or `{expiresAt:null}` for an owned personal file |
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

## Workspace notes and tasks

The workspace productivity migration adds shared workspace notes and tasks. Existing
`/api/v1/notes` and `/api/v1/tasks` routes provide personal productivity. Workspace
routes require the
normal authenticated session and an active workspace membership; writes also honor
the workspace subscription's read-only restriction. File IDs must identify ready,
non-deleted files in that same workspace. Attachment responses contain safe file
metadata only (`sizeBytes` is a decimal string); object keys are never returned.

| Method | Route | Request / response |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/notes` | List workspace notes, newest updated first |
| POST | `/api/v1/workspaces/:workspaceId/notes` | `{title,body,fileIds?}` → 201 note |
| PATCH | `/api/v1/workspaces/:workspaceId/notes/:noteId` | `{title?,body?,fileIds?}`; specifying `fileIds` replaces all attachments |
| DELETE | `/api/v1/workspaces/:workspaceId/notes/:noteId` | Delete note → 204 |
| GET | `/api/v1/workspaces/:workspaceId/tasks` | List workspace tasks, due date order |
| POST | `/api/v1/workspaces/:workspaceId/tasks` | `{title,description?,assigneeUserId?,dueAt?,status?,progress?,fileIds?}` → 201 task |
| PATCH | `/api/v1/workspaces/:workspaceId/tasks/:taskId` | Any task fields above; nullable `assigneeUserId`, `dueAt`, and `description` clear those fields; `fileIds` replaces attachments |
| DELETE | `/api/v1/workspaces/:workspaceId/tasks/:taskId` | Delete task → 204 |

Task status values are `TODO`, `IN_PROGRESS`, `BLOCKED`, and `DONE`; progress is an
integer from 0 to 100 and is checked both at the API boundary and in service logic.
An assignee must be an active member of the same workspace.
Attachment selection accepts at most 20 UUIDs and is scoped to the same workspace.
This API stores manually authored text only; voice-to-text stays on-device and no
cloud audio processing or AI transcription/extraction is provided.

The personal public-document form flow is at
`POST /api/v1/documents` with `type: "FORM"`; share with
`POST /api/v1/documents/:id/share`, read the public form at
`GET /api/v1/public-documents/:token`, submit at
`POST /api/v1/public-documents/:token/responses`, and view owned responses at
`GET /api/v1/documents/:id/responses`. The raw share token is returned only at
share creation and only its hash is stored. Public reads/submissions are
rate-limited. Existing personal form fields support short answer, paragraph,
multiple choice, checkbox, email, and numeric answers.

## Meeting records

Personal meetings use `GET/POST /api/v1/meetings`, `GET/PATCH/DELETE
/api/v1/meetings/:id`. Workspace meetings use the corresponding routes under
`/api/v1/workspaces/:workspaceId/meetings`. Create accepts
`{title,startedAt?,endedAt?,transcript,summary?,decisions?,recordingFileId?,actionItems?,calendarEventId?}`.
`calendarEventId` links the meeting to one unlinked calendar event in the same
personal or workspace scope. On update, omit it to keep the current link or
send `null` to unlink; linking another event moves the meeting link. Meeting
responses add `calendarEventId` and safe event metadata in `calendarEvent`.
Calendar event responses add `linkedMeetingId` and safe meeting metadata in
`linkedMeeting`; existing event fields are unchanged. Deleting a meeting removes
the event's meeting reference, and deleting an event does not delete its meeting.
Action items contain `{title,description?,dueAt?,assigneeUserId?}`. Supplying
`actionItems` on update replaces the list unless any current item is already
linked to a task; linked task items cannot be removed by replacement. To create
a task, POST to `/:id/action-items/:actionItemId/task` under the same meeting
route. This creates a regular personal or workspace task and links it to the
action item; repeated requests reuse the existing task.

Personal records are owner-scoped. Workspace records require active membership,
and workspace writes require a writable subscription. An optional recording
must already be a ready, nondeleted file in the same scope; file object keys
are not exposed. Transcript and decisions are user-entered only: there is no
audio upload, cloud transcription, or AI processing in this API.

## Workspace public forms

Workspace forms require an authenticated active member for management. Writes
also honor the workspace subscription's read-only restriction. Only the form
creator or a workspace owner/admin may manage the form or read its responses.

| Method | Route | Request / response |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/forms` | List safe form metadata and response counts |
| POST | `/api/v1/workspaces/:workspaceId/forms` | `{title,description?,schema,published?}` → 201 draft/form |
| GET/PATCH/DELETE | `/api/v1/workspaces/:workspaceId/forms/:formId` | Read/update/delete an owned or administrable form |
| POST | `/api/v1/workspaces/:workspaceId/forms/:formId/share` | Publish/rotate link; returns the raw token once |
| DELETE | `/api/v1/workspaces/:workspaceId/forms/:formId/share` | Revoke the public token |
| GET | `/api/v1/workspaces/:workspaceId/forms/:formId/responses` | Read submissions (manager only) |
| GET | `/api/v1/public-forms/:token` | Public form schema, no owner or workspace data |
| POST | `/api/v1/public-forms/:token/questions/:questionId/uploads` | Multipart `file` for a `FILE_UPLOAD` field → staged safe file metadata |
| POST | `/api/v1/public-forms/:token/responses` | `{name,email,answers}` → receipt `{id,submittedAt}` only |

`schema` has a `questions` array with unique IDs, prompt, required flag, and one
of `SHORT_ANSWER`, `PARAGRAPH`, `MULTIPLE_CHOICE`, `CHECKBOXES`, `EMAIL`, or
`NUMBER`, or `FILE_UPLOAD`. Choice questions require unique choices before
publication. Submission answers are checked against the published schema,
including required values, choice membership, email format, numeric bounds,
file-question ownership, size limits, and unknown keys.
Tokens are cryptographically random; only SHA-256 hashes are persisted. Public
read and submission endpoints are rate-limited, responses use `Cache-Control:
no-store`, and public endpoints never return form-owner metadata or response
records.

For a `FILE_UPLOAD` question, upload one file with multipart field `file` at
`POST /api/v1/public-forms/:token/questions/:questionId/uploads` before
submission. The 5 MiB limit, per-IP rate limit, PDF/PNG/JPEG signature and
extension checks apply; the upload goes through the existing workspace storage
quota reservation/finalization workflow. The response exposes only safe file
metadata and an opaque file ID. Submission accepts that staged ID only for the
same form and question, then consumes it into that response. Arbitrary file IDs
or files from another workspace/form are rejected. Unsubmitted uploads remain
ordinary quota-counted workspace files and can be managed/deleted through the
normal authenticated workspace storage routes.
