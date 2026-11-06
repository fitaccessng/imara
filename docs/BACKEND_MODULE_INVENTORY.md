# BACKEND MODULE INVENTORY

## Module list and responsibilities

### 1. Authentication Module
Responsibility: register, login, logout, token refresh, email verification, password reset, session management.
Main services: AuthService, SessionService, TokenService, VerificationService.
Controllers: AuthController, SessionController.
Security: Argon2id/hardened password hashing, rate limiting, origin checks, email token hashing.

### 2. Users Module
Responsibility: user identity lifecycle and current-user profile operations.
Main services: UserService, UserSettingsService.
Controllers: UsersController.
Database models: User, Profile, Session.

### 3. Profiles Module
Responsibility: personal metadata, preferences, storage usage summary, billing summary.
Main services: ProfileService, SettingsService.
Controllers: ProfileController, SettingsController.

### 4. Workspaces Module
Responsibility: create and manage workspaces for personal and company contexts.
Main services: WorkspaceService, WorkspaceAccessService.
Controllers: WorkspaceController.
Models: Workspace, WorkspaceMember.

### 5. Workspace Members Module
Responsibility: invite, remove, and manage team access to workspaces.
Main services: WorkspaceMemberService, InvitationService.
Controllers: WorkspaceMemberController.

### 6. Roles and Permissions Module
Responsibility: role definitions, permissions, access rules by resource and context.
Main services: RoleService, PermissionService, PolicyService.
Models: Role, Permission.

### 7. Storage Module
Responsibility: quota checks, storage summaries, reservations, and reconciliation.
Main services: StorageQuotaService, ReservationService, StorageLedgerService.
Models: StorageUsageSnapshot, maybe File size ledger tables.

### 8. Upload Sessions Module
Responsibility: manage multi-part or resumable uploads and store upload state.
Main services: UploadSessionService, ChunkUploadService.
Models: UploadSession.

### 9. Files Module
Responsibility: metadata CRUD, ownership, move, copy, rename, restore, trash logic.
Main services: FileService, FileLifecycleService, FileOwnershipService.
Models: File, FileVersion.

### 10. Folders Module
Responsibility: hierarchical folder structure, nested contents, deletion, restore, lock state.
Main services: FolderService, FolderTreeService.
Models: Folder.

### 11. Folder Security / PIN Module
Responsibility: protect folders with PIN, lock/unlock, verification, recovery.
Main services: FolderPinService, ProtectedFolderService.
Models: FolderPin.

### 12. File Versions Module
Responsibility: version creation, restoration, and file history tracking.
Main services: FileVersionService.
Models: FileVersion.

### 13. Search Module
Responsibility: global search across files and folders with filters and ranking.
Main services: SearchService, SearchIndexService.

### 14. Document Preview Module
Responsibility: generate preview metadata, preview URLs, and safe browser rendering payloads.
Main services: PreviewService, ThumbnailService.

### 15. Document Editing Module
Responsibility: save and merge work-in-progress edits for supported document types.
Main services: DocumentEditingService, ConflictResolutionService.

### 16. Document Conversion Module
Responsibility: convert files into viewable or editable formats via third-party tools.
Main services: ConversionService, OfficeFormatService.

### 17. PDF Module
Responsibility: render PDF previews and manage annotation payloads and signatures.
Main services: PdfRenderService, PdfAnnotationService.

### 18. Scanner Module
Responsibility: support the scanning workflow and document assembly from photos.
Main services: ScannerSessionService, DocumentCaptureService.

### 19. OCR Module
Responsibility: extract text from scanned or uploaded pages.
Main services: OcrService, OcrQueueService.
External integrations: OCR provider or Tesseract.

### 20. Image Processing Module
Responsibility: crop, rotate, enhance, and normalize images.
Main services: ImageProcessingService.

### 21. Audio and Video Module
Responsibility: generate or serve transcoded previews and metadata for media files.
Main services: MediaService, TranscodingService.

### 22. Sharing Module
Responsibility: create share links, revocation, public access, password restrictions, expiration handling.
Main services: ShareLinkService, ShareAccessService.
Models: ShareLink, ShareAccessLog.

### 23. Notifications Module
Responsibility: user alerts and system notifications.
Main services: NotificationService, NotificationDeliveryService.
Models: Notification.

### 24. Subscription Module
Responsibility: active subscription lifecycle and plan entitlements.
Main services: SubscriptionService, EntitlementService.
Models: Subscription.

### 25. Plans Module
Responsibility: define plan features, storage limits, and pricing metadata.
Main services: PlanService.
Models: Plan.

### 26. Payments Module
Responsibility: checkout initiation, provider callbacks, verification, and fraud checks.
Main services: PaymentService, ProviderWebhookService.
Models: Payment.

### 27. Invoices Module
Responsibility: invoice generation, status, and retrieval.
Main services: InvoiceService.
Models: Invoice.

### 28. Billing Module
Responsibility: billing profile, renewal rules, invoice summaries, and payment history.
Main services: BillingProfileService.
Models: BillingProfile.

### 29. Business Collaboration Module
Responsibility: business workspace operations, team permissions, and collaborative governance.
Main services: BusinessWorkspaceService.

### 30. Admin Module
Responsibility: platform-level management of users, subscriptions, payments, storage, and settings.
Main services: AdminUserService, AdminBillingService, AdminStorageService.

### 31. Audit Logs Module
Responsibility: capture user and system actions for compliance and investigation.
Main services: AuditLogService.
Models: AuditLog.

### 32. Email Module
Responsibility: transactional email sending for verification, reset, invites, and alerts.
Main services: EmailService, TemplateService.
External integrations: SMTP provider.

### 33. Background Jobs Module
Responsibility: queue job registration, scheduler, retry, and monitoring.
Main services: JobSchedulerService, WorkerRegistryService.

### 34. Analytics Module
Responsibility: user and platform analytics, storage usage trends, and report generation.
Main services: AnalyticsService, UsageReportService.

### 35. System Health Module
Responsibility: service availability, dependency health, and operational status.
Main services: HealthService, DependencyCheckService.

### 36. Session Management Module
Responsibility: manage authenticated sessions and device revocation at scale.
Main services: SessionManagerService.

### 37. Rate Limiting and Security Module
Responsibility: fail2ban-like throttling, login protection, and abuse detection.
Main services: RateLimitService, SecurityPolicyService.

### 38. Webhook/Event Dispatch Module
Responsibility: normalize provider webhooks, event processing, and downstream notifications.
Main services: WebhookProcessorService, EventDispatchService.
