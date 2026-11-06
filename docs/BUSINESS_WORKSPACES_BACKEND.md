# Business workspaces backend

The backend exposes a business workspace as a tenant separate from the user's
personal folders and files. Personal storage queries explicitly require
`workspaceId IS NULL`; workspace storage uses the workspace ID and does not
rely on client-side filtering.

## Permission precedence

- `OWNER` and `ADMIN` have full workspace and folder access.
- `MANAGER` and `STAFF` receive only folder-level grants.
- Rules are resolved from the root of the folder path down to the requested
  folder. A `GRANT` applies to its folder and, when `inherit=true`, every
  descendant (including folders created later).
- A `RESTRICT` on a folder removes matching inherited access at that folder
  and, when `inherit=true`, its descendants. A restriction wins over a grant
  at the same folder. A direct grant on a deeper descendant may explicitly
  re-grant access.
- With `inherit=false`, a rule is local to its selected folder.
- File operations authorize the file's workspace and containing folder before
  returning metadata or accessing object storage. Non-member, suspended, and
  removed users are denied; inaccessible folder/file identifiers return
  not-found responses to avoid metadata disclosure.

Permission identifiers are strings (currently `viewFolder`, `viewFiles`,
`uploadFiles`, `editFiles`, `renameFiles`, `moveFiles`, `downloadFiles`,
`deleteFiles`, `createSubfolders`, `renameFolders`, `manageContents`,
`shareFiles`, and `managePermissions`) so new keys can be added without
changing the permission table structure.

## API

All routes are under `/api/v1` and require the existing authenticated session,
except the existing public account registration/login flows.

The web app now exposes `/workspace`, `/workspace/team`,
`/workspace/team/invite`, `/workspace/team/:memberId`,
`/workspace/team/:memberId/permissions`, `/workspace/roles`,
`/workspace/invitations`, `/workspace/activity`, and the public
`/workspace/invitations/accept` flow. Registration can create a business
workspace by sending `accountType: "BUSINESS"` and an optional `workspaceName`.
Workspace members are routed to their first business workspace after sign-in.

- `GET|POST /workspaces`, `GET /workspaces/:workspaceId`,
  `GET /workspaces/:workspaceId/my-folders`
- Member list/details, role/name patch, suspend/restore/remove:
  `/workspaces/:workspaceId/members...`
- Invitation create/list/resend/revoke and
  `POST /invitations/:token/accept`. New users register through the existing
  email-verification flow using the invited address, sign in, and then accept.
- Member and folder permission GET/PUT/DELETE plus permission preview:
  `/workspaces/:workspaceId/members/:memberId/permissions` and
  `/workspaces/:workspaceId/folders/:folderId/permissions...`
- Workspace storage browsing, folder CRUD, and file upload/download/rename/
  move/delete: `/workspaces/:workspaceId/storage`, `/folders`, and `/files`.
- Persistent per-user notifications and read state:
  `/workspaces/:workspaceId/notifications...`
- Authorized audit activity:
  `GET /workspaces/:workspaceId/activity`

Invitation tokens are opaque 256-bit values; only SHA-256 digests are stored.
Invitations expire after seven days and are invalidated on resend/revoke.
Invitation delivery uses the existing `MailerService`. Local development/test
console mode logs the invitation URL instead of emailing it; outside that mode,
SMTP must be configured and delivery failures are surfaced.

Workspace storage has separate quota counters from personal storage. The
workspace starts with a 50 GiB limit and uploads are charged to that workspace.
Workspace object keys remain scoped under the workspace owner's storage prefix.

## Current limitations

- An invited new employee uses the existing registration and email verification
  endpoints, then signs in and accepts the invite; there is not a separate
  invite-token account-activation endpoint.
- Workspace folder sharing and administrative pages are connected to the
  backend, but document preview/editing callbacks, search, versions, and direct
  file sharing are not available in the existing product and are not implemented
  for workspace storage.
- Download authorization is enforced before the existing S3-compatible stream
  is returned; short-lived presigned URLs are not used.
- Audit entries include actor, target, metadata, and timestamp. Request IP and
  device/user-agent capture, audit pagination, and a scheduled stale-upload
  recovery worker are not yet implemented (stale workspace upload reservations
  are reconciled lazily on the next workspace upload).
- Custom roles, delegated staff administration, workspace deletion/ownership
  transfer, and business billing/subscription management are not implemented.
