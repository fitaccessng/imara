# SECURITY REQUIREMENTS

## Security baseline
- All auth-sensitive operations must be enforced on the backend.
- No file access or subscription entitlements are granted based on client-side checks alone.
- Signed URLs, scoped uploads, and object-store access control must limit direct exposure.
- Use secure session management with revocation support, expiration, and device traceability.
- All password values must be hashed with strong one-way algorithms.
- Protected folders must hash and verify the PIN server-side.

## Required backend enforcement
- Storage quota enforcement before final upload commitment
- Concurrent upload reservation and release logic
- Share link verification with password and expiration checks
- Ownership validation on file/folder actions
- Workspace access checks for every file and folder read/write operation
- Audit logs for all security-affecting events and destructive actions
- Rate limiting on auth, payment, shared-link access, and public endpoints
- Malware scanning before file availability is granted

## Presentation-only concerns
- Password strength indicator and UX hints
- Success/error banners for quota or billing state
- Client-side validation before backend submission
- Visual breadcrumbs and badges for protected or shared items

## Specific rules
- 5GB free storage quota is a logical entitlement and must be enforced server-side.
- Trash storage accounting is kept separate from active usage and should be reflected in storage reports.
- Subscription downgrade is not simply a UI change; it requires entitlement updates and storage recalculation.
- Protected folders must never expose raw PINs or secrets in URLs or client state.
- File ownership must be verified on download, move, restore, delete, and share operations.
- Signed URLs must be short-lived and associated with access scopes.
- File validation must reject unsupported or malicious content before persistence.
- Payment webhooks must be verified and processed idempotently.
- Session expiration and concurrent device revocation should be enforced centrally.
