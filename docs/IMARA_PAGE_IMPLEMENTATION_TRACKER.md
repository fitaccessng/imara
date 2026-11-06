# IMARA Page Implementation Tracker

This tracker maps the authoritative frontend inventory to the current IMARA codebase. It is used to track delivery across frontend, backend, permissions, and validation pipeline.

Status legend:
- Not Started
- In Progress
- UI Complete
- Backend Connected
- Tested
- Complete

## Repository baseline

Current implemented foundations already cover the main IMARA shell and core account flows:
- Public marketing landing page
- Login, registration, email verification, forgot/reset password
- Personal dashboard overview
- Personal file library management
- Account settings and active session management
- Business workspace team, invitations, roles, member permission controls, and activity pages
- Protected workspace routing and auth gating

The tracker below records the remaining inventory and the current implementation state as of this repository snapshot.

## A. Public website pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public website | Home | / | Complete | Backend Connected | Public | Guest | GET /public/marketing, GET /plans | marketing_content, plans | Tested |
| Public website | About IMARA | /about | Not Started | Not Started | Public | Guest | GET /content/about | company_profile | Not Started |
| Public website | Features | /features | Not Started | Not Started | Public | Guest | GET /content/features | feature_highlights | Not Started |
| Public website | How It Works | /how-it-works | Not Started | Not Started | Public | Guest | GET /content/workflow | onboarding_steps | Not Started |
| Public website | Pricing & Plans | /pricing | UI Complete | Backend Connected | Public | Guest | GET /subscriptions/plans | subscription_plans | Tested |
| Public website | Contact | /contact | Not Started | Not Started | Public | Guest | POST /support/contact | support_requests | Not Started |
| Public website | Help Centre | /help | Not Started | Not Started | Public | Guest | GET /help/categories, GET /help/articles | help_articles | Not Started |
| Public website | FAQ | /faq | Not Started | Not Started | Public | Guest | GET /faq | faq_entries | Not Started |
| Public website | Terms & Conditions | /terms | Not Started | Not Started | Public | Guest | GET /legal/terms | legal_documents | Not Started |
| Public website | Privacy Policy | /privacy | Not Started | Not Started | Public | Guest | GET /legal/privacy | legal_documents | Not Started |
| Public website | Security Information | /security | Not Started | Not Started | Public | Guest | GET /security/info | security_docs | Not Started |
| Public website | Login | /login | Complete | Backend Connected | Public | Guest | POST /auth/login, POST /auth/logout | users, auth_sessions | Tested |
| Public website | Registration | /register | Complete | Backend Connected | Public | Guest | POST /auth/register, POST /auth/verify-email | users, user_profiles, workspaces | Tested |
| Public website | Email Verification | /verify-email | Complete | Backend Connected | Public | Guest | POST /auth/verify-email | users, email_tokens | Tested |
| Public website | Forgot Password | /forgot-password | Complete | Backend Connected | Public | Guest | POST /auth/forgot-password | users, reset_tokens | Tested |
| Public website | Reset Password | /reset-password | Complete | Backend Connected | Public | Guest | POST /auth/reset-password | users, reset_tokens | Tested |
| Public website | Account Recovery | /account-recovery | Not Started | Not Started | Public | Guest | POST /auth/recovery/start, POST /auth/recovery/complete | users, recovery_requests | Not Started |
| Public website | Accessibility Statement | /accessibility | Not Started | Not Started | Public | Guest | GET /legal/accessibility | accessibility_policy | Not Started |

## B. Authentication and onboarding pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication & onboarding | Registration | /register | Complete | Backend Connected | Public | Guest | POST /auth/register | users, accounts, workspaces | Tested |
| Authentication & onboarding | Email Verification | /verify-email | Complete | Backend Connected | Public | Guest | POST /auth/verify-email | users, email_tokens | Tested |
| Authentication & onboarding | Login | /login | Complete | Backend Connected | Public | Guest | POST /auth/login, POST /auth/logout | users, auth_sessions | Tested |
| Authentication & onboarding | Password Recovery | /forgot-password | Complete | Backend Connected | Public | Guest | POST /auth/forgot-password | users, reset_tokens | Tested |
| Authentication & onboarding | Password Reset | /reset-password | Complete | Backend Connected | Public | Guest | POST /auth/reset-password | users, reset_tokens | Tested |
| Authentication & onboarding | Account Setup | /onboarding/account-setup | Not Started | Not Started | Authenticated | User | GET /users/me, PATCH /users/me | users, user_profiles | Not Started |
| Authentication & onboarding | Profile Information | /onboarding/profile | Not Started | Not Started | Authenticated | User | PATCH /users/me | users, user_profiles | Not Started |
| Authentication & onboarding | Personal Workspace Creation | /onboarding/personal-workspace | UI Complete | Backend Connected | Authenticated | User | POST /workspaces | workspaces, workspace_members | Tested |
| Authentication & onboarding | Business Workspace Creation | /onboarding/business-workspace | UI Complete | Backend Connected | Authenticated | User | POST /workspaces | workspaces, workspace_members | Tested |
| Authentication & onboarding | Initial Onboarding | /onboarding | Not Started | Not Started | Authenticated | User | GET /onboarding/state, PATCH /onboarding/state | onboarding_state | Not Started |
| Authentication & onboarding | Plan Selection | /plans | UI Complete | Backend Connected | Authenticated | User | GET /subscriptions/plans | subscription_plans | Backend Connected |
| Authentication & onboarding | Welcome Screen | /welcome | Not Started | Not Started | Authenticated | User | GET /users/summary | users, onboarding_state | Not Started |
| Authentication & onboarding | First-Time Dashboard | /dashboard | Complete | Backend Connected | Authenticated | User | GET /dashboard/summary | users, documents, subscriptions | Tested |

## C. Main user dashboard pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Dashboard Overview | /dashboard | Complete | Backend Connected | Authenticated | User | GET /dashboard/summary | users, files, folders, subscriptions | Tested |
| Dashboard | My Files | /files | Complete | Backend Connected | Authenticated | User | GET /files, POST /files, POST /folders | users, folders, files | Tested |
| Dashboard | All Files | /files | Complete | Backend Connected | Authenticated | User | GET /files | users, folders, files | Tested |
| Dashboard | My Folders | /files | Complete | Backend Connected | Authenticated | User | GET /folders, POST /folders | folders | Tested |
| Dashboard | Folder Details | /files?folder=:id | Complete | Backend Connected | Authenticated | User | GET /folders/:id, GET /files?folderId=:id | folders, files | Tested |
| Dashboard | Recent Files | /files?sort=recent | Not Started | Not Started | Authenticated | User | GET /files/recent | files, file_activity | Not Started |
| Dashboard | Starred Files | /files?view=starred | Not Started | Not Started | Authenticated | User | GET /files/starred | files, favorites | Not Started |
| Dashboard | Shared With Me | /shared-with-me | Not Started | Not Started | Authenticated | User | GET /shares/incoming | shares, files, folders | Not Started |
| Dashboard | Shared By Me | /shared-by-me | Not Started | Not Started | Authenticated | User | GET /shares/outgoing | shares, files, folders | Not Started |
| Dashboard | Trash / Recycle Bin | /trash | Not Started | Not Started | Authenticated | User | GET /files/trash, POST /files/:id/restore | files, file_versions | Not Started |
| Dashboard | Storage Overview | /dashboard | Complete | Backend Connected | Authenticated | User | GET /dashboard/summary | users, subscriptions, quota_usage | Tested |
| Dashboard | Storage Management | /settings/storage | UI Complete | Backend Connected | Authenticated | User | GET /storage, PATCH /storage/quota | subscriptions, storage_usage | Tested |
| Dashboard | Upload Manager | /files | UI Complete | Backend Connected | Authenticated | User | POST /files, GET /files/uploads | files, upload_jobs | UI Complete |
| Dashboard | File Details | /files/:fileId | Not Started | Not Started | Authenticated | User | GET /files/:id, GET /files/:id/activity | files, file_versions | Not Started |
| Dashboard | File Activity | /files/:fileId/activity | Not Started | Not Started | Authenticated | User | GET /files/:id/activity | file_activity | Not Started |
| Dashboard | File Version History | /files/:fileId/versions | Not Started | Not Started | Authenticated | User | GET /files/:id/versions | file_versions | Not Started |
| Dashboard | Notifications | /notifications | Not Started | Not Started | Authenticated | User | GET /notifications, PATCH /notifications/:id/read | notifications | Not Started |
| Dashboard | Global Search Results | /search | Not Started | Not Started | Authenticated | User | GET /search | files, folders, users | Not Started |

## D. Folder management pages and screens

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Folder management | Folder Details | /files?folder=:id | Complete | Backend Connected | Authenticated | User | GET /folders/:id, GET /files?folderId=:id | folders, files | Tested |
| Folder management | Folder Activity | /folders/:id/activity | Not Started | Not Started | Authenticated | User | GET /folders/:id/activity | folder_activity | Not Started |
| Folder management | Folder Access and Permissions | /workspace/team/:memberId/permissions | Complete | Backend Connected | Authenticated | Workspace Admin/Owner | GET /workspaces/:id/members/:memberId/permissions, PUT /workspaces/:id/members/:memberId/permissions | workspace_members, folder_rules, permission_grants | Tested |
| Folder management | Create Folder Modal | /files | UI Complete | Backend Connected | Authenticated | User | POST /folders | folders | Tested |
| Folder management | Create Subfolder Drawer | /files?folder=:id | UI Complete | Backend Connected | Authenticated | User | POST /folders | folders | Tested |
| Folder management | Rename Folder Dialog | /files | UI Complete | Backend Connected | Authenticated | User | PATCH /folders/:id | folders | Tested |
| Folder management | Move Folder Dialog | /files | Not Started | Not Started | Authenticated | User | PATCH /folders/:id/move | folders | Not Started |
| Folder management | Delete Folder Modal | /files | UI Complete | Backend Connected | Authenticated | User | DELETE /folders/:id | folders, files | Tested |
| Folder management | Restore Folder Modal | /trash | Not Started | Not Started | Authenticated | User | POST /folders/:id/restore | folders, deleted_items | Not Started |
| Folder management | Lock Folder Dialog | /files | Not Started | Not Started | Authenticated | User | PATCH /folders/:id/lock | folders | Not Started |
| Folder management | Unlock Folder Dialog | /files | Not Started | Not Started | Authenticated | User | PATCH /folders/:id/unlock | folders | Not Started |
| Folder management | Set Six-Digit PIN Drawer | /folders/:id/pin | Not Started | Not Started | Authenticated | User | POST /folders/:id/pin | folder_pins | Not Started |
| Folder management | Change Folder PIN Dialog | /folders/:id/pin | Not Started | Not Started | Authenticated | User | PATCH /folders/:id/pin | folder_pins | Not Started |
| Folder management | Recover Folder Access Dialog | /folders/:id/recover | Not Started | Not Started | Authenticated | User | POST /folders/:id/recover-pin | folder_pins, audit_logs | Not Started |
| Folder management | Folder Permissions Drawer | /workspace/team/:memberId/permissions | Complete | Backend Connected | Authenticated | Workspace Admin/Owner | GET/PUT /workspaces/:id/members/:memberId/permissions | workspace_members, folder_rules | Tested |
| Folder management | Folder Sharing Drawer | /shares/folders/:id | Not Started | Not Started | Authenticated | User | GET/POST /shares/folders/:id | shares, permissions | Not Started |
| Folder management | Folder Activity Popover | /folders/:id/activity | Not Started | Not Started | Authenticated | User | GET /folders/:id/activity | folder_activity | Not Started |

## E. Document workspace pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Document workspace | Document Workspace Shell | /files/:fileId | Not Started | Not Started | Authenticated | User | GET /files/:id | files, folders | Not Started |
| Document workspace | Word Document Viewer & Editor | /files/:fileId/docx | Not Started | Not Started | Authenticated | User | GET /files/:id, PATCH /files/:id/content | files, file_versions | Not Started |
| Document workspace | Excel Viewer & Editor | /files/:fileId/xlsx | Not Started | Not Started | Authenticated | User | GET /files/:id, PATCH /files/:id/content | files, file_versions | Not Started |
| Document workspace | PowerPoint Viewer & Editor | /files/:fileId/pptx | Not Started | Not Started | Authenticated | User | GET /files/:id, PATCH /files/:id/content | files, file_versions | Not Started |
| Document workspace | PDF Viewer | /files/:fileId/pdf | Not Started | Not Started | Authenticated | User | GET /files/:id/download | files, file_versions | Not Started |
| Document workspace | PDF Annotation Tools | /files/:fileId/pdf#annotate | Not Started | Not Started | Authenticated | User | GET /files/:id, POST /files/:id/annotations | files, annotations | Not Started |
| Document workspace | TXT Editor | /files/:fileId/txt | Not Started | Not Started | Authenticated | User | GET /files/:id, PATCH /files/:id/content | files, file_versions | Not Started |
| Document workspace | Image Viewer | /files/:fileId/image | Not Started | Not Started | Authenticated | User | GET /files/:id | files, thumbnails | Not Started |
| Document workspace | Audio Player | /files/:fileId/audio | Not Started | Not Started | Authenticated | User | GET /files/:id/download | files | Not Started |
| Document workspace | Video Player | /files/:fileId/video | Not Started | Not Started | Authenticated | User | GET /files/:id/download | files | Not Started |
| Document workspace | Unsupported File Preview | /files/:fileId/preview | Not Started | Not Started | Authenticated | User | GET /files/:id | files | Not Started |
| Document workspace | File Information Panel | /files/:fileId | Not Started | Not Started | Authenticated | User | GET /files/:id | files | Not Started |
| Document workspace | Version History Interface | /files/:fileId/versions | Not Started | Not Started | Authenticated | User | GET /files/:id/versions | file_versions | Not Started |
| Document workspace | Save & Conflict Resolution | /files/:fileId | Not Started | Not Started | Authenticated | User | PATCH /files/:id, GET /files/:id/versions | files, file_versions | Not Started |

## F. Document scanner pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Document scanner | Scanner Home | /scanner | Not Started | Not Started | Authenticated | User | GET /scanner/templates | scanner_jobs | Not Started |
| Document scanner | Camera Permission | /scanner | Not Started | Not Started | Authenticated | User | POST /scanner/camera-status | scanner_jobs | Not Started |
| Document scanner | Camera Scanning Interface | /scanner/capture | Not Started | Not Started | Authenticated | User | POST /scanner/capture | scanner_jobs, scanned_pages | Not Started |
| Document scanner | Capture Document | /scanner/capture | Not Started | Not Started | Authenticated | User | POST /scanner/capture | scanner_jobs | Not Started |
| Document scanner | Edge Detection & Cropping | /scanner/edit | Not Started | Not Started | Authenticated | User | PATCH /scanner/pages/:id | scanned_pages | Not Started |
| Document scanner | Image Enhancement | /scanner/edit | Not Started | Not Started | Authenticated | User | PATCH /scanner/pages/:id | scanned_pages | Not Started |
| Document scanner | Page Rotation | /scanner/edit | Not Started | Not Started | Authenticated | User | PATCH /scanner/pages/:id | scanned_pages | Not Started |
| Document scanner | Multi-page Document Manager | /scanner/pages | Not Started | Not Started | Authenticated | User | GET /scanner/jobs/:id/pages | scanned_pages | Not Started |
| Document scanner | Page Reordering | /scanner/pages | Not Started | Not Started | Authenticated | User | PATCH /scanner/jobs/:id/pages/order | scanned_pages | Not Started |
| Document scanner | OCR Processing Status | /scanner/jobs/:id | Not Started | Not Started | Authenticated | User | GET /scanner/jobs/:id, POST /scanner/jobs/:id/ocr | scanner_jobs, ocr_results | Not Started |
| Document scanner | PDF Preview | /scanner/jobs/:id/preview | Not Started | Not Started | Authenticated | User | GET /scanner/jobs/:id/pdf | scanner_jobs | Not Started |
| Document scanner | Save Scanned Document | /scanner/jobs/:id/save | Not Started | Not Started | Authenticated | User | POST /scanner/jobs/:id/save | scanner_jobs, files | Not Started |
| Document scanner | Destination Folder Selection | /scanner/save | Not Started | Not Started | Authenticated | User | GET /folders, POST /scanner/jobs/:id/save | folders, files | Not Started |

## G. Sharing and collaboration pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sharing & collaboration | Share File | /files/:fileId/share | Not Started | Not Started | Authenticated | User | POST /shares/files/:id | shares, file_access | Not Started |
| Sharing & collaboration | Share Folder | /folders/:id/share | Not Started | Not Started | Authenticated | User | POST /shares/folders/:id | shares, folder_access | Not Started |
| Sharing & collaboration | Create Sharing Link | /shares/new | Not Started | Not Started | Authenticated | User | POST /shares/links | share_links | Not Started |
| Sharing & collaboration | Sharing Link Settings | /shares/links/:id | Not Started | Not Started | Authenticated | User | GET/PATCH /shares/links/:id | share_links | Not Started |
| Sharing & collaboration | Password-Protected Sharing | /shares/links/:id | Not Started | Not Started | Authenticated | User | PATCH /shares/links/:id/password | share_links | Not Started |
| Sharing & collaboration | Expiration Settings | /shares/links/:id | Not Started | Not Started | Authenticated | User | PATCH /shares/links/:id/expiry | share_links | Not Started |
| Sharing & collaboration | Shared Files Management | /shared-by-me | Not Started | Not Started | Authenticated | User | GET /shares/outgoing | shares | Not Started |
| Sharing & collaboration | Public / Recipient-Facing Shared File Access | /s/:token | Not Started | Not Started | Public | Guest | GET /shares/public/:token | share_links, files | Not Started |
| Sharing & collaboration | Shared File Preview | /s/:token | Not Started | Not Started | Public | Guest | GET /shares/public/:token | share_links, files | Not Started |
| Sharing & collaboration | Access Denied | /access-denied | Not Started | Not Started | Authenticated | User | N/A | access_logs | Not Started |
| Sharing & collaboration | Expired Link | /s/:token/expired | Not Started | Not Started | Public | Guest | GET /shares/public/:token | share_links | Not Started |
| Sharing & collaboration | Business Workspace | /workspace | Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces, GET /workspaces/:id | workspaces, workspace_members | Tested |
| Sharing & collaboration | Team Members | /workspace/team | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET /workspaces/:id/members | workspace_members, users | Tested |
| Sharing & collaboration | Invite Members | /workspace/team/invite | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | POST /workspaces/:id/invitations | workspace_invitations | Tested |
| Sharing & collaboration | Member Permissions | /workspace/team/:memberId/permissions | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/PUT /workspaces/:id/members/:memberId/permissions | workspace_members, folder_rules | Tested |
| Sharing & collaboration | Shared Workspace Folders | /workspace | Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces/:id/folders | folders, workspace_members | Tested |

## H. Subscription and billing pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Subscription & billing | Pricing Plans | /pricing | UI Complete | Backend Connected | Public | Guest | GET /subscriptions/plans | subscription_plans | Tested |
| Subscription & billing | Plan Comparison | /plans/compare | Not Started | Not Started | Public | Guest | GET /subscriptions/plans | subscription_plans | Not Started |
| Subscription & billing | Upgrade Subscription | /billing/upgrade | Not Started | Not Started | Authenticated | User | POST /subscriptions/upgrade | subscriptions, invoices | Not Started |
| Subscription & billing | Downgrade Subscription | /billing/downgrade | Not Started | Not Started | Authenticated | User | POST /subscriptions/downgrade | subscriptions | Not Started |
| Subscription & billing | Checkout | /billing/checkout | Not Started | Not Started | Authenticated | User | POST /billing/checkout | subscriptions, invoices | Not Started |
| Subscription & billing | Payment Processing Status | /billing/checkout/status | Not Started | Not Started | Authenticated | User | GET /billing/status | subscriptions, payments | Not Started |
| Subscription & billing | Payment Success | /billing/success | Not Started | Not Started | Authenticated | User | GET /billing/summary | payments, invoices | Not Started |
| Subscription & billing | Payment Failure | /billing/failure | Not Started | Not Started | Authenticated | User | GET /billing/summary | payments, invoices | Not Started |
| Subscription & billing | Subscription Overview | /settings/subscription | Not Started | Not Started | Authenticated | User | GET /subscriptions/me | subscriptions | Not Started |
| Subscription & billing | Payment History | /settings/billing/payments | Not Started | Not Started | Authenticated | User | GET /payments | payments | Not Started |
| Subscription & billing | Invoice List | /settings/billing/invoices | Not Started | Not Started | Authenticated | User | GET /invoices | invoices | Not Started |
| Subscription & billing | Invoice Details | /settings/billing/invoices/:id | Not Started | Not Started | Authenticated | User | GET /invoices/:id | invoices | Not Started |
| Subscription & billing | Billing Information | /settings/billing | Not Started | Not Started | Authenticated | User | GET/PATCH /billing/profile | billing_profiles | Not Started |
| Subscription & billing | Subscription Renewal | /settings/billing/renewal | Not Started | Not Started | Authenticated | User | POST /subscriptions/renew | subscriptions | Not Started |
| Subscription & billing | Storage Upgrade | /settings/storage | UI Complete | Backend Connected | Authenticated | User | GET /storage, PATCH /storage/quota | storage_usage, subscription_plans | Tested |
| Subscription & billing | Subscription Expiry / Downgrade Notice | /billing/notice | Not Started | Not Started | Authenticated | User | GET /subscriptions/me | subscriptions | Not Started |

## I. User settings pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| User settings | Profile Settings | /settings/profile | Complete | Backend Connected | Authenticated | User | GET/PATCH /users/me | users, user_profiles | Tested |
| User settings | Account Settings | /settings | Complete | Backend Connected | Authenticated | User | GET /users/me | users | Tested |
| User settings | Password & Security | /settings/profile#security | Complete | Backend Connected | Authenticated | User | POST /auth/change-password, GET /auth/sessions | users, auth_sessions | Tested |
| User settings | Active Sessions | /settings/profile#security | Complete | Backend Connected | Authenticated | User | GET/DELETE /auth/sessions | auth_sessions | Tested |
| User settings | Notification Preferences | /settings/notifications | Not Started | Not Started | Authenticated | User | GET/PATCH /notifications/preferences | notification_preferences | Not Started |
| User settings | Storage Settings | /settings/storage | UI Complete | Backend Connected | Authenticated | User | GET /storage | storage_usage | Tested |
| User settings | Subscription Settings | /settings/subscription | Not Started | Not Started | Authenticated | User | GET /subscriptions/me | subscriptions | Not Started |
| User settings | Workspace Settings | /settings/workspace | UI Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/PATCH /workspaces/:id | workspaces | Tested |
| User settings | Privacy Settings | /settings/privacy | Not Started | Not Started | Authenticated | User | GET/PATCH /privacy/preferences | privacy_settings | Not Started |
| User settings | Account Deletion | /settings/delete-account | Not Started | Not Started | Authenticated | User | DELETE /users/me | users, audit_logs | Not Started |
| User settings | Account Recovery | /account-recovery | Not Started | Not Started | Authenticated | User | POST /auth/recovery/start | users, recovery_requests | Not Started |

## J. Business workspace pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business workspace | Business Dashboard | /workspace | Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces, GET /workspaces/:id | workspaces, workspace_members | Tested |
| Business workspace | Workspace Overview | /workspace | Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces/:id | workspaces | Tested |
| Business workspace | Team Members | /workspace/team | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET /workspaces/:id/members | workspace_members, users | Tested |
| Business workspace | Invite Members | /workspace/team/invite | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | POST /workspaces/:id/invitations | workspace_invitations | Tested |
| Business workspace | Member Management | /workspace/team/:memberId | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/PATCH/DELETE /workspaces/:id/members/:memberId | workspace_members | Tested |
| Business workspace | Roles & Permissions | /workspace/roles | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET /workspaces/:id/roles | roles, workspace_members | Tested |
| Business workspace | Shared Files | /workspace/files | Not Started | Not Started | Authenticated | Workspace Member | GET /workspace/files | files, workspaces | Not Started |
| Business workspace | Shared Folders | /workspace/folders | UI Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces/:id/my-folders | folders, workspace_members | Tested |
| Business workspace | Business Storage | /workspace/storage | UI Complete | Backend Connected | Authenticated | Workspace Member | GET /workspaces/:id/storage | workspaces, storage_usage | Tested |
| Business workspace | Workspace Activity | /workspace/activity | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET /workspaces/:id/activity | workspace_activity | Tested |
| Business workspace | Business Billing | /workspace/billing | Not Started | Not Started | Authenticated | Workspace Owner/Admin | GET /workspaces/:id/billing | subscriptions, invoices | Not Started |
| Business workspace | Workspace Settings | /workspace/settings | UI Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/PATCH /workspaces/:id | workspaces | Tested |
| Business workspace | Workspace Invitations | /workspace/invitations | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/POST/DELETE /workspaces/:id/invitations | workspace_invitations | Tested |
| Business workspace | Folder-Level Permissions | /workspace/team/:memberId/permissions | Complete | Backend Connected | Authenticated | Workspace Owner/Admin | GET/PUT /workspaces/:id/members/:memberId/permissions | folder_rules, permission_grants | Tested |
| Business workspace | Invitation Acceptance | /workspace/invitations/accept | Complete | Backend Connected | Authenticated or Guest | User | POST /invitations/:token/accept | workspace_invitations, workspace_members | Tested |

## K. Super admin dashboard pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Super admin dashboard | Admin Overview | /admin | Not Started | Not Started | Authenticated | Super Admin | GET /admin/overview | users, subscriptions, storage_usage | Not Started |
| Super admin dashboard | User Management | /admin/users | Not Started | Not Started | Authenticated | Super Admin | GET /admin/users | users, user_profiles | Not Started |
| Super admin dashboard | User Details | /admin/users/:userId | Not Started | Not Started | Authenticated | Super Admin | GET /admin/users/:userId | users, subscriptions | Not Started |
| Super admin dashboard | Account Suspension | /admin/users/:userId/suspend | Not Started | Not Started | Authenticated | Super Admin | POST /admin/users/:userId/suspend | users, audit_logs | Not Started |
| Super admin dashboard | Business Account Management | /admin/workspaces | Not Started | Not Started | Authenticated | Super Admin | GET /admin/workspaces | workspaces, workspace_members | Not Started |
| Super admin dashboard | Subscription Management | /admin/subscriptions | Not Started | Not Started | Authenticated | Super Admin | GET /admin/subscriptions | subscriptions, invoices | Not Started |
| Super admin dashboard | Plan Management | /admin/plans | Not Started | Not Started | Authenticated | Super Admin | GET/POST/PATCH /admin/plans | subscription_plans | Not Started |
| Super admin dashboard | Payment Management | /admin/payments | Not Started | Not Started | Authenticated | Super Admin | GET /admin/payments | payments | Not Started |
| Super admin dashboard | Invoice Management | /admin/invoices | Not Started | Not Started | Authenticated | Super Admin | GET /admin/invoices | invoices | Not Started |
| Super admin dashboard | Storage Monitoring | /admin/storage | Not Started | Not Started | Authenticated | Super Admin | GET /admin/storage | storage_usage, usage_events | Not Started |
| Super admin dashboard | Platform Storage Analytics | /admin/storage/analytics | Not Started | Not Started | Authenticated | Super Admin | GET /admin/storage/analytics | storage_usage | Not Started |
| Super admin dashboard | File and Upload Monitoring | /admin/uploads | Not Started | Not Started | Authenticated | Super Admin | GET /admin/uploads | files, upload_jobs | Not Started |
| Super admin dashboard | Security Monitoring | /admin/security | Not Started | Not Started | Authenticated | Super Admin | GET /admin/security | audit_logs, sessions | Not Started |
| Super admin dashboard | Audit Logs | /admin/audit-logs | Not Started | Not Started | Authenticated | Super Admin | GET /admin/audit-logs | audit_logs | Not Started |
| Super admin dashboard | Notification Management | /admin/notifications | Not Started | Not Started | Authenticated | Super Admin | GET/PATCH /admin/notifications | notifications | Not Started |
| Super admin dashboard | Platform Settings | /admin/settings | Not Started | Not Started | Authenticated | Super Admin | GET/PATCH /admin/settings | platform_settings | Not Started |
| Super admin dashboard | Admin Roles and Permissions | /admin/roles | Not Started | Not Started | Authenticated | Super Admin | GET /admin/roles | admin_roles, permissions | Not Started |
| Super admin dashboard | System Health | /admin/health | Not Started | Not Started | Authenticated | Super Admin | GET /admin/health | system_health | Not Started |
| Super admin dashboard | Background Job Monitoring | /admin/jobs | Not Started | Not Started | Authenticated | Super Admin | GET /admin/jobs | background_jobs | Not Started |

## L. System and utility pages

| Page category | Page name | Proposed route | Frontend implementation status | Backend integration status | Authentication requirement | Required user role | Required API endpoints | Required database models | Testing status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| System & utility | 404 Page | /404 | UI Complete | Backend Connected | Public | Guest | N/A | N/A | UI Complete |
| System & utility | 403 Access Denied | /403 | UI Complete | Backend Connected | Authenticated | User | N/A | access_rules | UI Complete |
| System & utility | 500 Server Error | /500 | Not Started | Not Started | Public | Guest | N/A | error_logs | Not Started |
| System & utility | Maintenance Page | /maintenance | Not Started | Not Started | Public | Guest | GET /system/health | system_settings | Not Started |
| System & utility | Offline State | /offline | Not Started | Not Started | Public | Guest | N/A | connectivity_state | Not Started |
| System & utility | Loading States | global | Complete | Backend Connected | Authenticated | User | N/A | N/A | Tested |
| System & utility | Empty States | global | Complete | Backend Connected | Authenticated | User | N/A | N/A | Tested |
| System & utility | No Search Results | /search | Not Started | Not Started | Authenticated | User | GET /search | files, folders | Not Started |
| System & utility | Upload Failed | /files | UI Complete | Backend Connected | Authenticated | User | POST /files | files, upload_jobs | UI Complete |
| System & utility | Storage Limit Reached | /dashboard | UI Complete | Backend Connected | Authenticated | User | GET /dashboard/summary | subscriptions, quota_usage | Tested |
| System & utility | Session Expired | /login | Complete | Backend Connected | Public | Guest | POST /auth/login | auth_sessions | Tested |
| System & utility | Account Suspended | /suspended | Not Started | Not Started | Authenticated | User | GET /users/me | users | Not Started |
| System & utility | Unsupported File Type | /files | UI Complete | Backend Connected | Authenticated | User | GET /files | files | UI Complete |
| System & utility | Invalid Sharing Link | /s/:token | Not Started | Not Started | Public | Guest | GET /shares/public/:token | share_links | Not Started |

## Delivery notes

1. The repository already includes a strong foundation for the IMARA platform and is closest to completion in the personal account, authentication, dashboard, and business workspace ownership/admin flows.
2. The key remaining product frontier is the advanced document workspace, scanner/OCR, sharing, billing, and super-admin modules.
3. This tracker should be treated as the source of truth for page status during implementation and QA, with the core codebase and API routes updated in parallel with each landing screen and workspace module.
4. The current web app route structure is aligned with the inventory for the implemented portions: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/dashboard`, `/files`, `/settings/profile`, `/workspace`, `/workspace/team`, `/workspace/team/invite`, `/workspace/team/:memberId/permissions`, `/workspace/invitations`, `/workspace/activity`, `/workspace/roles`, and `/workspace/invitations/accept`.
