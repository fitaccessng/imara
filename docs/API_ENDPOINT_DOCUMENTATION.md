# API ENDPOINT DOCUMENTATION

> This file includes planned endpoints as well as implemented ones. For the
> routes actually present and connected to the UI, see
> [API integration status](./API_INTEGRATION_STATUS.md). Do not assume every
> endpoint listed below is available.

## Authentication endpoints
| Method | Endpoint | Purpose | Auth | Permission |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Register a personal account or a business owner and workspace | No | Public |
| POST | `/api/v1/auth/login` | Authenticate and create session | No | Public |
| POST | `/api/v1/auth/logout` | Terminate current session | Yes | User |
| POST | `/api/v1/auth/refresh` | Refresh access token or session | Yes | User |
| POST | `/api/v1/auth/verify-email` | Verify email token | No | Public |
| POST | `/api/v1/auth/resend-verification` | Resend verification email | Yes | User |
| POST | `/api/v1/auth/forgot-password` | Request password reset | No | Public |
| POST | `/api/v1/auth/reset-password` | Reset password using token | No | Public |
| POST | `/api/v1/auth/change-password` | Change password while authenticated | Yes | User |
| GET | `/api/v1/auth/sessions` | List active sessions | Yes | User |
| DELETE | `/api/v1/auth/sessions/:sessionId` | Revoke an active session | Yes | User |
| GET | `/api/v1/users/me` | Get authenticated profile | Yes | User |
| PATCH | `/api/v1/users/me` | Update profile details | Yes | User |
| PATCH | `/api/v1/users/me/password` | Change password | Yes | User |
| GET | `/api/v1/users/me/storage` | Get quota usage summary | Yes | User |
| GET | `/api/v1/users/me/notifications` | List notifications | Yes | User |
| PATCH | `/api/v1/users/me/notifications/:id/read` | Mark notification as read | Yes | User |
| PATCH | `/api/v1/users/me/notifications/read-all` | Mark all notifications read | Yes | User |
| POST | `/api/v1/workspaces` | Create a workspace | Yes | User |
| GET | `/api/v1/workspaces` | List workspaces the user belongs to | Yes | User |
| GET | `/api/v1/workspaces/:workspaceId` | Get workspace details | Yes | Active member |
| PATCH | `/api/v1/workspaces/:workspaceId` | Update workspace name | Yes | Owner |
| GET | `/api/v1/workspaces/:workspaceId/my-folders` | List folders accessible to the current member | Yes | Active member |
| GET | `/api/v1/workspaces/:workspaceId/members` | List workspace members | Yes | Owner/Admin |
| GET | `/api/v1/workspaces/:workspaceId/members/:memberId` | Get member details and assigned rules | Yes | Owner/Admin |
| PATCH | `/api/v1/workspaces/:workspaceId/members/:memberId` | Update member role or workspace display name | Yes | Owner/Admin, subject to role limits |
| POST | `/api/v1/workspaces/:workspaceId/members/:memberId/suspend` | Suspend workspace access | Yes | Owner/Admin |
| POST | `/api/v1/workspaces/:workspaceId/members/:memberId/restore` | Restore workspace access | Yes | Owner/Admin |
| DELETE | `/api/v1/workspaces/:workspaceId/members/:memberId` | Remove a member and revoke folder rules | Yes | Owner/Admin |
| POST | `/api/v1/workspaces/:workspaceId/invitations` | Invite a user by email | Yes | Owner/Admin |
| GET | `/api/v1/workspaces/:workspaceId/invitations` | List invitations | Yes | Owner/Admin |
| POST | `/api/v1/workspaces/:workspaceId/invitations/:invitationId/resend` | Resend an invitation | Yes | Owner/Admin |
| DELETE | `/api/v1/workspaces/:workspaceId/invitations/:invitationId` | Revoke a pending invitation | Yes | Owner/Admin |
| POST | `/api/v1/invitations/:token/accept` | Accept an invitation for the signed-in email | Yes | Invited user |
| GET | `/api/v1/workspaces/:workspaceId/members/:memberId/permissions` | Read a member's folder rules | Yes | Owner/Admin |
| PUT | `/api/v1/workspaces/:workspaceId/members/:memberId/permissions` | Replace a member's folder rules | Yes | Owner/Admin |
| GET | `/api/v1/workspaces/:workspaceId/folders/:folderId/permissions` | List rules attached to a folder | Yes | Owner/Admin |
| PUT | `/api/v1/workspaces/:workspaceId/folders/:folderId/permissions` | Set a folder grant or restriction | Yes | Owner/Admin |
| DELETE | `/api/v1/workspaces/:workspaceId/folders/:folderId/permissions/:permissionId` | Remove a folder rule | Yes | Owner/Admin |
| POST | `/api/v1/workspaces/:workspaceId/folders/:folderId/permissions/preview` | Preview a candidate permission grant | Yes | Owner/Admin |
| GET | `/api/v1/workspaces/:workspaceId/storage` | List authorized folders and files | Yes | Active member |
| GET | `/api/v1/workspaces/:workspaceId/folders` | List authorized child folders | Yes | Active member |
| GET | `/api/v1/workspaces/:workspaceId/folders/:folderId` | Get an authorized folder | Yes | Active member with view access |
| POST | `/api/v1/workspaces/:workspaceId/folders` | Create a workspace folder | Yes | Owner/Admin or permitted member |
| PATCH | `/api/v1/workspaces/:workspaceId/folders/:folderId` | Rename a workspace folder | Yes | Owner/Admin or permitted member |
| DELETE | `/api/v1/workspaces/:workspaceId/folders/:folderId` | Delete an empty workspace folder | Yes | Owner/Admin or permitted member |
| POST | `/api/v1/workspaces/:workspaceId/files` | Upload a workspace file | Yes | Owner/Admin or permitted member |
| GET | `/api/v1/workspaces/:workspaceId/files/:fileId/download` | Download a workspace file | Yes | Owner/Admin or permitted member |
| PATCH | `/api/v1/workspaces/:workspaceId/files/:fileId` | Rename a workspace file | Yes | Owner/Admin or permitted member |
| POST | `/api/v1/workspaces/:workspaceId/files/:fileId/move` | Move a workspace file | Yes | Owner/Admin or permitted member |
| DELETE | `/api/v1/workspaces/:workspaceId/files/:fileId` | Delete a workspace file | Yes | Owner/Admin or permitted member |
| GET | `/api/v1/workspaces/:workspaceId/notifications` | List the signed-in member's notifications | Yes | Active member |
| POST | `/api/v1/workspaces/:workspaceId/notifications/:notificationId/read` | Mark a notification read | Yes | Notification recipient |
| GET | `/api/v1/workspaces/:workspaceId/activity` | List workspace audit activity | Yes | Owner/Admin |
| POST | `/api/v1/files/upload/initiate` | Start upload session | Yes | User |
| POST | `/api/v1/files/upload/complete` | Finalize multipart upload | Yes | User |
| POST | `/api/v1/files/upload/cancel` | Cancel upload session | Yes | User |
| GET | `/api/v1/files` | List files in current scope | Yes | User |
| GET | `/api/v1/search?q=:query` | Search personal file and folder names (up to 50 of each) | Yes | User |
| GET | `/api/v1/files/:id` | Get file metadata | Yes | User/Member |
| GET | `/api/v1/files/:id/download` | Download a file | Yes | User/Member |
| PATCH | `/api/v1/files/:id` | Rename or update metadata | Yes | User/Owner |
| POST | `/api/v1/files/:id/move` | Move file | Yes | User/Owner |
| POST | `/api/v1/files/:id/copy` | Copy file | Yes | User/Owner |
| DELETE | `/api/v1/files/:id` | Delete file to trash | Yes | User/Owner |
| POST | `/api/v1/files/:id/restore` | Restore file from trash | Yes | User/Owner |
| DELETE | `/api/v1/files/:id/permanent` | Delete file permanently | Yes | User/Owner |
| POST | `/api/v1/files/:id/star` | Star a file | Yes | User/Owner |
| DELETE | `/api/v1/files/:id/star` | Unstar a file | Yes | User/Owner |
| POST | `/api/v1/files/:id/share` | Create file share settings | Yes | User/Owner |
| GET | `/api/v1/files/:id/versions` | List file versions | Yes | User/Owner |
| POST | `/api/v1/folders` | Create a folder | Yes | User/Owner |
| GET | `/api/v1/folders` | List folders | Yes | User/Member |
| GET | `/api/v1/folders/tree` | List the signed-in user's personal folder tree | Yes | User |
| GET | `/api/v1/folders/:id` | Get folder details | Yes | User/Member |
| PATCH | `/api/v1/folders/:id` | Rename folder | Yes | User/Owner |
| POST | `/api/v1/folders/:id/move` | Move folder | Yes | User/Owner |
| DELETE | `/api/v1/folders/:id` | Delete folder | Yes | User/Owner |
| POST | `/api/v1/folders/:id/restore` | Restore folder | Yes | User/Owner |
| GET | `/api/v1/folders/:id/contents` | List nested content | Yes | User/Member |
| POST | `/api/v1/folders/:id/lock` | Lock folder | Yes | User/Owner |
| POST | `/api/v1/folders/:id/unlock` | Unlock folder | Yes | User/Owner |
| POST | `/api/v1/folders/:id/pin` | Create / set folder PIN | Yes | User/Owner |
| PATCH | `/api/v1/folders/:id/pin` | Change folder PIN | Yes | User/Owner |
| POST | `/api/v1/folders/:id/pin/verify` | Verify folder PIN | Yes | User/Member |
| POST | `/api/v1/folders/:id/pin/recover` | Recover access to protected folder | Yes | User/Owner |
| GET | `/api/v1/folders/:id/permissions` | Get folder permissions | Yes | User/Member |
| PATCH | `/api/v1/folders/:id/permissions` | Update folder permissions | Yes | User/Owner |
| GET | `/api/v1/folders/:id/activity` | Get folder activity | Yes | User/Member |
| GET | `/api/v1/file-versions` | List versions across resources | Yes | User |
| GET | `/api/v1/file-versions/:id` | View version metadata | Yes | User/Owner |
| POST | `/api/v1/file-versions/:id/restore` | Restore previous version | Yes | User/Owner |
| GET | `/api/v1/search` | Global search | Yes | User |
| GET | `/api/v1/search/files` | Search files only | Yes | User |
| GET | `/api/v1/search/folders` | Search folders only | Yes | User |
| POST | `/api/v1/search/filter` | Apply advanced filters | Yes | User |
| POST | `/api/v1/shares` | Create a share link | Yes | User/Owner |
| GET | `/api/v1/shares/:id` | Get sharing settings | Yes | User/Owner |
| PATCH | `/api/v1/shares/:id` | Update share settings | Yes | User/Owner |
| DELETE | `/api/v1/shares/:id` | Revoke a share token | Yes | User/Owner |
| GET | `/api/v1/shares/public/:token` | Access shared file via public link | No | Public |
| POST | `/api/v1/shares/public/:token/verify` | Verify share password | No | Public |
| GET | `/api/v1/shares/me` | List shared resources | Yes | User |
| GET | `/api/v1/subscriptions/plans` | List all plans | Yes | User |
| GET | `/api/v1/subscriptions/me` | Get current subscription | Yes | User |
| POST | `/api/v1/subscriptions/upgrade` | Upgrade subscription | Yes | User |
| POST | `/api/v1/subscriptions/downgrade` | Downgrade subscription | Yes | User |
| POST | `/api/v1/subscriptions/cancel` | Cancel subscription | Yes | User |
| POST | `/api/v1/subscriptions/renew` | Renew subscription | Yes | User |
| GET | `/api/v1/subscriptions/history` | List subscription history | Yes | User |
| POST | `/api/v1/payments/initiate` | Initialize checkout session | Yes | User |
| POST | `/api/v1/payments/verify` | Verify payment completion | Yes | User |
| POST | `/api/v1/payments/webhook` | Handle provider webhook | No | Provider |
| GET | `/api/v1/payments/history` | List payment history | Yes | User |
| GET | `/api/v1/invoices` | List invoices | Yes | User |
| GET | `/api/v1/invoices/:id` | Get invoice details | Yes | User |
| GET | `/api/v1/billing/info` | Get billing profile | Yes | User |
| PATCH | `/api/v1/billing/info` | Update billing information | Yes | User |
| GET | `/api/v1/notifications` | List notifications | Yes | User |
| PATCH | `/api/v1/notifications/:id/read` | Mark notification read | Yes | User |
| PATCH | `/api/v1/notifications/read-all` | Mark all notifications read | Yes | User |
| DELETE | `/api/v1/notifications/:id` | Delete notification | Yes | User |
| GET | `/api/v1/admin/users` | List platform users | Yes | Super Admin |
| GET | `/api/v1/admin/users/:id` | View user details | Yes | Super Admin |
| PATCH | `/api/v1/admin/users/:id/suspend` | Suspend or unsuspend user | Yes | Super Admin |
| GET | `/api/v1/admin/businesses` | List business workspaces | Yes | Super Admin |
| GET | `/api/v1/admin/subscriptions` | Manage subscriptions | Yes | Super Admin |
| GET | `/api/v1/admin/plans` | List plan catalog | Yes | Super Admin |
| POST | `/api/v1/admin/plans` | Create or update plan | Yes | Super Admin |
| GET | `/api/v1/admin/payments` | List platform payments | Yes | Super Admin |
| GET | `/api/v1/admin/invoices` | List all invoices | Yes | Super Admin |
| GET | `/api/v1/admin/storage` | View storage analytics | Yes | Super Admin |
| GET | `/api/v1/admin/audit-logs` | List audit logs | Yes | Super Admin |
| GET | `/api/v1/admin/system-health` | Get system health | Yes | Super Admin |
| GET | `/api/v1/admin/jobs` | List background jobs | Yes | Super Admin |
| GET | `/api/v1/admin/settings` | Get platform settings | Yes | Super Admin |
| PATCH | `/api/v1/admin/settings` | Update platform settings | Yes | Super Admin |
| POST | `/api/v1/scanner/session` | Create scanner session | Yes | User |
| POST | `/api/v1/scanner/upload` | Upload scanned page image | Yes | User |
| POST | `/api/v1/scanner/crop` | Apply crop to scanned page | Yes | User |
| POST | `/api/v1/scanner/ocr` | Queue OCR job for page set | Yes | User |
| POST | `/api/v1/scanner/merge` | Combine scanned pages | Yes | User |
| GET | `/api/v1/scanner/:id` | Get scanner job status | Yes | User |
| POST | `/api/v1/documents/:id/preview` | Generate preview payload | Yes | User/Member |
| POST | `/api/v1/documents/:id/convert` | Convert document to preview format | Yes | User/Owner |
| POST | `/api/v1/documents/:id/save` | Save document revisions | Yes | User/Owner |
| POST | `/api/v1/documents/:id/conflicts` | Resolve editing conflicts | Yes | User/Owner |
| GET | `/api/v1/analytics/usage` | Get storage / activity analytics | Yes | User |
| GET | `/api/v1/system/health` | Service health endpoint | No | Internal |

## Event photo/video collection (implemented)

All routes below are prefixed with `/api/v1`. Event management and organizer media
routes require an authenticated session cookie. Public capture and gallery routes use
opaque event tokens and do not require login.

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/events` | Create event; returns capture/gallery tokens once | Organizer |
| GET | `/api/v1/events` | List organizer's events | Organizer |
| GET | `/api/v1/events/:id` | Get event details and storage usage | Organizer |
| PATCH | `/api/v1/events/:id` | Update name/date/description/gallery access | Organizer |
| POST | `/api/v1/events/:id/rotate-tokens` | Revoke old tokens and return new ones | Organizer |
| DELETE | `/api/v1/events/:id` | Delete event and its stored media | Organizer |
| GET | `/api/v1/events/:id/media` | List event media | Organizer |
| GET | `/api/v1/events/:id/media/:mediaId/download` | Stream organizer media | Organizer |
| GET | `/api/v1/events/capture/:token` | Get public capture-page event details | Capture token |
| POST | `/api/v1/events/capture/:token/uploads` | Upload one image/video (`multipart` field `file`) | Capture token |
| GET | `/api/v1/events/gallery/:token` | Get public gallery and media list | Gallery token / passcode grant |
| POST | `/api/v1/events/gallery/:token/unlock` | Unlock a protected gallery | Gallery token |
| GET | `/api/v1/events/gallery/:token/media/:mediaId/download` | Stream gallery media | Gallery token / passcode grant |

Create payload:

```json
{
  "name": "Wedding",
  "date": "2026-10-01T18:00:00.000Z",
  "description": "Optional",
  "folderId": "optional-owned-folder-uuid",
  "gallerySetting": "PRIVATE",
  "passcode": "only required for PASSCODE"
}
```

`gallerySetting` is `PRIVATE` (default), `LINK_PUBLIC`, or `PASSCODE`. `passcode`
is accepted only with `PASSCODE` and must be 8–128 characters. The create response is
`{ "event": { "id", "name", "date", "description", "gallerySetting", "folderId",
"storage": { "capBytes", "usedBytes", "reservedBytes", "availableBytes" },
"createdAt", "updatedAt" }, "tokens": { "captureToken", "galleryToken" } }`.
Token values are high-entropy opaque strings and are returned only at creation or
rotation; they are SHA-256 digests at rest. The client should immediately save/encode
the capture token into the QR capture-page URL and keep the gallery token for sharing.
If lost, rotate both tokens; old links stop working. Event updates accept any subset of
`name`, `date`, `description` (nullable), `gallerySetting`, and `passcode`. Switching
to `PASSCODE` requires an existing or newly supplied passcode; changing the passcode
or access setting invalidates previous gallery unlock grants.

The list route returns an array of event objects; GET by ID and PATCH return one event
object in the same shape as the `event` member above. Token rotation returns
`{ "captureToken", "galleryToken" }`; delete returns 204. Organizer media lists and
gallery media lists return arrays of
`{ "id", "name", "mimeType", "sizeBytes", "createdAt" }`, where `sizeBytes` is a
decimal string. Organizer/capture event details contain `{ "id", "name", "date",
"description" }`. A successful upload returns
`{ "id", "name", "mimeType", "sizeBytes", "folderId", "eventId", "createdAt" }`.
Gallery GET returns `{ "event": { "id", "name", "date", "description" }, "media": [...] }`.
Download routes stream the original media bytes with its stored content type.

Capture upload is `multipart/form-data` with a single `file`. Accepted types are
JPEG, PNG, GIF, WebP, MP4, QuickTime, and WebM, checked against file signatures and
the configured `MAX_UPLOAD_BYTES` (default and hard limit 25 MiB). Each event's
immutable byte cap is the organizer's remaining subscription quota when the event is
created. In-progress reservations and completed media count against both the event cap
and the account subscription quota.

Gallery unlock payload is `{ "passcode": "..." }`; success returns
`{ "accessToken": "...", "expiresAt": "..." }`. Send the returned value as
`Authorization: Bearer <accessToken>` to list or download media; grants expire after
30 minutes. `LINK_PUBLIC` galleries need only the gallery token. Private galleries
always return 404 on public gallery routes. Public uploads and passcode unlocks have
stricter per-IP route throttles in addition to the global limiter. Since tokens are in
route paths, reverse-proxy/access logs and analytics must redact `/events/capture/*`
and `/events/gallery/*` paths; the API does not log tokens.

Media is streamed from the configured private S3-compatible object store; no public
bucket URLs are issued. Run the new migration and regenerate Prisma Client before
starting the API. Event deletion blocks new captures, removes stored objects and quota
usage, and can be retried if an upload or object-store deletion is still in progress.
