# BACKGROUND JOBS AND INTEGRATIONS

## Background jobs

### 1. Malware scan
Trigger: file upload finalization or file reprocessing.
Input: file metadata and object key.
Process: send file to malware provider, inspect result, update scan status.
Output: clean/suspicious/failed result with log record.
Failure handling: retry with backoff; quarantine suspicious files.
BullMQ / Redis: Yes.
External service: malware scanning API.

### 2. File type verification
Trigger: new upload session completion or media imported from scanner.
Process: inspect MIME type, extension, and extension-to-content checks.
Output: normalized type classification and security verdict.
Failure handling: reject if mismatch or unsupported.
BullMQ / Redis: Yes.
External service: optional schema validation service or local parser.

### 3. Thumbnail generation
Trigger: image or document upload.
Process: create preview images and low-resolution versions.
Output: generated thumbnail object key and metadata.
Failure handling: fallback to generic icon.
BullMQ / Redis: Yes.
External service: image service or local worker.

### 4. Browser document editing
Trigger: a user opens a supported document in the file viewer.
Process: edit CSV/XLSX cells, add a PDF page note, or edit DOCX/PPTX text in the browser, then save a quota-checked replacement.
Output: updated stored document.
BullMQ / Redis: No.
External service: none required.

### 5. OCR processing
Trigger: scanned document or uploaded image batch.
Process: send PNG/PDF page set to OCR provider, parse recognized text.
Output: searchable text and OCR overlays.
Failure handling: retry queue and preserve original scan.
BullMQ / Redis: Yes.
External service: OCR engine.

### 6. PDF generation
Trigger: scanned multi-page document or exported content.
Process: assemble pages into final PDF document.
Output: PDF object key and metadata.
BullMQ / Redis: Yes.
External service: local PDF library or server-side render engine.

### 7. Image enhancement
Trigger: scan capture workflow.
Process: sharpen, denoise, deskew, contrast shift, and crop edges.
Output: cleaned image pages.
Failure handling: keep original alongside enhanced version.
BullMQ / Redis: Yes.
External service: optional image processing pipeline.

### 8. Upload cleanup
Trigger: stale uploads or abandoned session expiration.
Process: delete stale temp objects and session records.
Output: freed storage and clean queue state.
Failure handling: retry and alert if not cleaned.
BullMQ / Redis: Yes.
External service: object storage cleanup.

### 9. Expired upload cleanup
Trigger: scheduled TTL for upload sessions.
Process: mark expired uploads and release reserved bytes.
Output: quota reservation release and temp object deletion.
BullMQ / Redis: Yes.
External service: object storage.

### 10. Subscription renewal processing
Trigger: payment due date or renewal window.
Process: verify and apply renewal, extend plan, create invoice, update status.
Output: renewed subscription status and receipt.
Failure handling: retry with backoff and notify user when renewal fails.
BullMQ / Redis: Yes.
External service: payment provider.

### 11. Payment webhook processing
Trigger: provider callback arrives.
Process: verify signature, persist event, reconcile payment state, notify subscribers.
Output: updated Payment and Subscription records.
Failure handling: idempotent replay processing and event store retention.
BullMQ / Redis: Yes.
External service: Stripe / Paystack / Flutterwave.

### 12. Email notifications
Trigger: registration, password reset, invite, payment, or storage alerts.
Process: queue email templates and send with SMTP.
Output: email delivery log and tracking.
Failure handling: retry queue and record failure event.
BullMQ / Redis: Yes.
External service: SMTP provider.

### 13. Storage usage reconciliation
Trigger: scheduled daily or hourly reconciliation.
Process: compare object storage usage with relational metadata and storage ledger.
Output: updated current quota values and warnings.
Failure handling: reconcile in batches and flag anomalies.
BullMQ / Redis: Yes.
External service: object storage API and analytics pipeline.

### 14. File deletion and permanent cleanup
Trigger: physical deletion after retention window or user-confirmed purge.
Process: remove object from blob storage and purge metadata and logs as required.
Output: freed storage and audit trail.
Failure handling: retry and ensure soft-delete remains until confirmed.
BullMQ / Redis: Yes.
External service: object storage.

### 15. Scheduled subscription expiry checks
Trigger: cron scheduler.
Process: find subscriptions approaching or past due dates, downgrade or suspend entitlements.
Output: subscription status update and notifications.
BullMQ / Redis: Yes.
External service: none beyond internal scheduler and notification service.

### 16. Share link expiry enforcement
Trigger: scheduled expiry scan.
Process: revoke expired share links and update file listing metadata.
Output: share links disabled.
BullMQ / Redis: Yes.
External service: none.

### 17. Workspace invitation expiry cleanup
Trigger: invitation TTL expiration.
Process: revoke invites and notify workspace owners if necessary.
Output: invite closed and member not added.
BullMQ / Redis: Yes.
External service: email service if notice is required.

### 18. Audit log rollup
Trigger: scheduled periodic aggregation.
Process: summarise recent event streams for reporting and storage reduction.
Output: aggregated audit report or archive.
BullMQ / Redis: Yes.
External service: optional analytics warehouse.

## External integrations and classification

### Infrastructure and backend services
- PostgreSQL
- Redis / BullMQ
- S3-compatible object storage (Cloudflare R2 or Amazon S3)
- SMTP email provider
- Payment provider webhooks and APIs
- Malware scanning service
- OCR engine
- PDF conversion service

### Browser-side libraries and UI components
- PDF.js
- Media playback libraries or native browser fallback
- Scanner camera capture APIs

### Backend services and conversion tools
- Client-side spreadsheet, ZIP/XML preview, and PDF libraries
- OCR provider and image processing pipelines
- Payment providers: Stripe, Paystack, Flutterwave
