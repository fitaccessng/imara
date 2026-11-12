# IMARA

IMARA is a secure digital home for documents and files. The repository includes the
app foundation, account security flows, a PostgreSQL-backed Free subscription, and
Phase 2's private file library, quota-safe uploads, and folder management.

## Stack

- `apps/web`: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query,
  React Hook Form and Zod
- `apps/api`: NestJS, TypeScript, Prisma and PostgreSQL
- Local database: PostgreSQL 16 via Docker Compose

## Requirements

- Node.js `22.22.3+`, `24.15+`, or `26+`
- npm
- Docker with the Compose plugin, for local PostgreSQL
- SMTP credentials for real email delivery (optional for local testing)

## Run locally

From the repository root:

```sh
npm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm run prisma:generate -w @imara/api
npm run prisma:deploy -w @imara/api
```

The API template's `DATABASE_URL` matches the local Compose service. For local
testing without an SMTP provider, set `EMAIL_DELIVERY=console` in
`apps/api/.env`. Email verification is temporarily skipped for local testing:
new accounts are auto-verified, and existing unverified local accounts can sign
in. Password-reset and workspace invitation links are printed to the API log
instead of emailed; open those links in the browser. This mode is only honored
when `NODE_ENV` is `development` or `test`.
Printed links contain usable one-time tokens, so keep local API logs private.
For local photo/video uploads, use `OBJECT_STORAGE_DRIVER=local`; files are kept
under the ignored `apps/api/.local-object-storage/` directory. This driver is
rejected outside development/test. In production, the API uses
`OBJECT_STORAGE_DRIVER=hivepod` to send objects over authenticated HTTPS to a
small service running on the `imara-documents` HivePod. That service writes to
the pod's persistent `/home/hivepod/data/imara-storage/objects` volume. The API
requires `HIVEPOD_STORAGE_URL` and a private `HIVEPOD_STORAGE_TOKEN`; the
S3-compatible `OBJECT_STORAGE_DRIVER=s3` remains available when Hive Buckets are
operational.
For real email delivery, use `EMAIL_DELIVERY=smtp` and configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. The
console mode is not used in production.

Run the API and web app in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev
```

The frontend is served at `http://localhost:5173` and the API at
`http://localhost:3001/api/v1`. In development, the web app defaults to the
same-origin `/api/v1` path and Vite proxies API requests to port `3001`, avoiding
browser CORS issues when Vite selects a different port. Set `VITE_API_URL` in
`apps/web/.env` only when the API is hosted at a different URL. If using a
direct cross-origin API URL, add the exact frontend origin to `CORS_ORIGINS` in
`apps/api/.env`.

No sample account is created. The seed command only verifies the database connection:

```sh
npm run prisma:seed -w @imara/api
```

## Validation

```sh
npm run build
npm test
```

The frontend and API packages also expose targeted `build` and `test` scripts. The
current `npm test` workspace suite covers API unit tests; the frontend is type-checked
and production-built, but does not yet have a separate UI test runner. Prisma schema
and migration details, API routes, cookie/CORS settings, SMTP behavior, and security
notes are documented in [apps/api/README.md](./apps/api/README.md).

## Phase 1 and 2 functionality

- Registration, login, logout, email verification and resend
- Forgot/reset password and authenticated password change
- HttpOnly, server-side revocable sessions; active-session listing and revocation
- Profile updates, account storage/subscription information and dashboard summary
- Argon2id password hashing, hashed single-use email tokens, DTO validation, origin
  checks, secure headers, and rate limits
- A Free plan quota of 5,368,709,120 bytes (5 GiB), stored as a logical allowance
- Private file upload/download/delete and owned folder management
- PDF, DOCX, PPTX, and media previews; in-browser CSV/XLSX editing and PDF notes
- S3-compatible DockHive Hive Buckets integration, configured with environment values
- Atomic quota reservations, persisted file metadata, and dashboard storage accounting

## Not implemented yet

Scanner/OCR, sharing, paid plans/payments, business workspaces,
notifications, and administration are future milestones. Object storage remains
unavailable until a DockHive S3-compatible endpoint, bucket, and access credentials are
configured; no credentials or provider endpoint are checked into this repository.

## Configuration and deployment

The checked-in environment files are examples only. Do not commit `.env` files or
production credentials. For production, use managed PostgreSQL, HTTPS, a production
frontend origin in `CORS_ORIGINS`, `COOKIE_SECURE=true`, and real SMTP credentials.
Review the API README for cross-site cookie configuration and operational caveats.

For the `www.useimara.space` web deployment, set `VITE_PUBLIC_APP_URL` to
`https://www.useimara.space` in the web build environment. Set `FRONTEND_URL` to the
same URL in the API environment so email links point to the deployed app, and set
`CORS_ORIGINS=https://www.useimara.space,https://useimara.space` if both hostnames
serve the app. Production builds default to
`https://spidey-sango-3at3.dockhive.app/api/v1`. The API must allow the web origins
above in `CORS_ORIGINS` and use `COOKIE_SECURE=true` with
`COOKIE_SAME_SITE=none` for credentialed cross-site requests. Set `VITE_API_URL`
only when the API is deployed at a different address.

For email, set `EMAIL_DELIVERY=smtp`, `SMTP_HOST=smtp-relay.brevo.com`,
`SMTP_PORT=587`, `SMTP_SECURE=false`, and `SMTP_USER` to the SMTP login provided by
your email provider. Set `SMTP_PASSWORD` to the provider's SMTP key (not your
account password), and `SMTP_FROM` to a sender address verified by that provider,
for example `IMARA <noreply@useimara.space>`. Add these values to the API host's
environment/secret settings as well as local `apps/api/.env` when testing locally.
Never put the SMTP key in the web app environment or commit it.

For Namecheap cPanel, build the web app with `npm run build -w @imara/web` and
upload the **contents** of `apps/web/dist` (including `.htaccess`) into the
document root assigned to `www.useimara.space` in cPanel's Domains page. Point the
domain's DNS at the server using the exact record/target shown by Namecheap or
your DNS provider, then enable HTTPS in cPanel. The `.htaccess` file disables
directory indexes and routes client-side pages back to `index.html`. The current
directory listing indicates the built files are not in the active document root.

### Viewing and editing documents

PDF, DOCX, and PPTX files have browser previews. CSV/XLSX can be edited in a
spreadsheet grid; PDFs support page notes; DOCX/PPTX support lightweight text
editing while retaining the surrounding document package. Complex layout,
images, and mixed text formatting are not fully represented in these previews.
These features run in the browser and do not require a document server. Saves
use the API's permission and quota checks.
