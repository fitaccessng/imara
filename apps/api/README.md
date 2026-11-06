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

The API listens on `http://localhost:3001`. Use `npm run build -w @imara/api` and
`npm test -w @imara/api` for validation. For schema development,
`npm run prisma:migrate -w @imara/api -- --name add_feature`
creates a migration; commit the generated migration, then use
`npm run prisma:deploy -w @imara/api` for deployment.
`npm run prisma:seed -w @imara/api` only checks the connection; no demo user or
credentials are created.

`CORS_ORIGINS` is a comma-separated exact-origin allowlist and defaults to the Vite
origin `http://localhost:5173`. Browser requests must use credentials
(`fetch(..., { credentials: 'include' })`). The API also rejects disallowed `Origin`
headers on requests. In production set `COOKIE_SECURE=true`, use HTTPS, use a
production frontend origin, and keep SMTP/database secrets outside source control.
For cross-site frontend/API hosting, configure `COOKIE_SAME_SITE=none` together with
`COOKIE_SECURE=true`; otherwise the default `lax` cookie is preferable.

Email is not simulated. Registration, resend-verification and forgot-password return
503 until all SMTP variables are supplied. A configured but failing SMTP service will
also return 503. Email verification and password recovery use six-digit, single-use
codes with a configurable 10-minute expiry, up to five attempts per code, and SHA-256
digests stored in the database. Legacy verification and reset links remain accepted.
Invitation tokens are random, single-use, time-limited, and stored only as SHA-256 digests.
Operational delivery retry/queueing is intentionally not implemented.

## Object storage configuration

Uploads use DockHive Hive Buckets through its S3-compatible API. Set
`DOCKHIVE_S3_ENDPOINT`, `DOCKHIVE_BUCKET`, `DOCKHIVE_ACCESS_KEY_ID`, and
`DOCKHIVE_SECRET_ACCESS_KEY` using values from your DockHive account. `DOCKHIVE_S3_REGION`
defaults to `us-east-1`; `DOCKHIVE_S3_FORCE_PATH_STYLE` defaults to `true`. These
variables intentionally do not contain a guessed DockHive hostname or credentials:
configure the endpoint and keys shown for your bucket. Production requires an HTTPS
endpoint. Upload/download/delete return 503 when storage is not configured or unavailable.

Uploads are proxied through the API and buffered in memory, capped at 25 MiB per file
(`MAX_UPLOAD_BYTES`, with a hard 25 MiB maximum); the upload route is additionally
rate-limited. Consider this cap when sizing API memory and bandwidth. The server records
random user-scoped object keys; filenames and MIME types are metadata only and are never
used to construct object keys. Downloads are private, authenticated attachments and are
sent with `nosniff`. Do not expose the bucket publicly.

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
| POST | `/api/v1/auth/login` | `{email,password}` → 200 `{user:{id,email,name,emailVerified}}`; sets session cookie |
| POST | `/api/v1/auth/logout` | Authenticated → 204, revokes current session and clears cookie |
| GET | `/api/v1/auth/me` | Authenticated → `{id,email,name,emailVerified,createdAt}` |
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
multipart file, `MAX_UPLOAD_BYTES` (up to 25 MiB), and a stricter per-route throttle.
They use the existing private S3-compatible storage, atomic subscription quota
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
