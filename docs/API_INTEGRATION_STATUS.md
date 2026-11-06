# API integration status

## Local connection

The web app sends requests to `/api/v1` by default. Vite proxies this path to
`http://127.0.0.1:3001`, so the API still needs to be started separately:

1. Copy `.env.example` to `.env` and `apps/api/.env.example` to `apps/api/.env`.
2. Start PostgreSQL and apply the Prisma migrations using the commands in the
   [README run-local section](../README.md#run-locally).
3. Run `npm run dev:api` in one terminal and `npm run dev` in another.

The API requires `DATABASE_URL` during startup. The API process was not listening
on port 3001 when this integration was reviewed; a browser `ERR_CONNECTION_REFUSED`
means no HTTP response was received. Starting the web app alone does not start
the API. For direct cross-origin API URLs, configure the exact web origin in
`CORS_ORIGINS`.

## Connected application surfaces

| UI surface | API integration |
| --- | --- |
| Login, registration, email verification, password recovery | `/auth/*` |
| Session check and sign out | `/auth/me`, `/auth/logout` |
| Dashboard | `/dashboard/summary` |
| Personal library | `/files`, `/folders` and their implemented upload/download/rename/delete/move actions |
| Folder destination picker | `GET /folders/tree`; `POST /folders/:id/move` rejects moves into the folder itself or a descendant |
| Personal library search | `GET /search?q=...` (personal file/folder names; up to 50 results of each kind) |
| Profile and active sessions | `/users/me`, `/auth/change-password`, `/auth/sessions` |
| Subscription summary | `GET /subscription` |
| Business workspace storage, members, permissions, invitations, activity, notifications | `/workspaces/*` and `/invitations/:token/accept` |
| Event creation, QR capture uploads, private/link/passcode galleries | `/events/*` |

Inventory URLs that represent an already-supported screen are routed to that
screen (for example, `/my-files` and `/all-files` use the personal library).
This keeps aliases functional instead of rendering disconnected placeholders.

## Not yet provided by backend

The current backend does not implement checkout/payment processing, invoices or
paid plan changes; trash/restore, file versions or file/folder sharing links;
document editing, scanning or OCR; platform-admin management; account deletion;
or dynamic public content/help/contact APIs. The corresponding page inventory
files are still UI scaffolds and must not be presented as backend-integrated
features until their API and authorization rules are implemented.

Event media is stored in the configured private object store. Development/test
can use the explicit local filesystem driver; production requires the configured
private S3-compatible store. Passcode-protected gallery unlocks use short-lived
access grants.
