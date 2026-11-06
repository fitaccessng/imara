# FRONTEND PAGE INVENTORY

## Inventory summary
This inventory captures all page-level flows for IMARA and is intentionally structured by user journey and screen role. Total page entries across the full inventory: 167.

## A. Public website pages
## Public website pages

1. Home
2. About IMARA
3. Features
4. How It Works
5. Pricing & Plans
6. Contact
7. Help Centre
8. FAQ
9. Terms & Conditions
10. Privacy Policy
11. Security Information
12. Login
13. Registration
14. Email Verification
15. Forgot Password
16. Reset Password
17. Account Recovery
18. Accessibility Statement


### Detailed page specifications
1. Home: marketing landing page for IMARA, CTA to sign up, pricing, trust signals, screenshots, and conversion funnel.
2. About IMARA: company story, mission, product pillars, trust and compliance highlights.
3. Features: detailed feature list and benefits broken down by personal and business needs.
4. How It Works: product workflow from signing up to uploading, organizing, sharing, and collaborating.
5. Pricing & Plans: shows the Free plan's 5 GiB allowance and notes that paid plans are coming soon.
6. Contact: basic contact form, support channels, business outreach, and issue reporting.
7. Help Centre: support articles, onboarding walkthroughs, troubleshooting, and docs.
8. FAQ: common questions for registration, billing, storage, sharing, and security.
9. Terms & Conditions: legal terms governing platform use and service obligations.
10. Privacy Policy: data handling, retention, storage, and privacy rights information.
11. Security Information: encryption, access control, malware checks, and platform security overview.
12. Login: email/password sign-in and secure session creation.
13. Registration: account creation with email, password, marketing consent, and acceptance of terms.
14. Email Verification: confirmation after signup and account activation.
15. Forgot Password: initiate recovery workflow using an email token.
16. Reset Password: new password submission using reset token.
17. Account Recovery: recovery assistance for locked or unreachable accounts.
18. Accessibility Statement: accessibility policy and supported assistive workflow notes.

## B. Authentication & onboarding pages
## Authentication and onboarding pages

1. Registration
2. Email Verification
3. Login
4. Password Recovery
5. Password Reset
6. Account Setup
7. Profile Information
8. Personal Workspace Creation
9. Business Workspace Creation
10. Initial Onboarding
11. Plan Selection
12. Welcome Screen
13. First-Time Dashboard


### Purpose by page
- Registration: create account and choose sign-up mode.
- Email Verification: confirm the email address and unlock account usage.
- Login: secure authentication with passkeys, password, or session-based auth depending on implementation.
- Password Recovery: step-by-step password reset initiation.
- Password Reset: token-based password update with validation.
- Account Setup: confirm account readiness and initial user expectations.
- Profile Information: capture personal details and onboarding preferences.
- Personal Workspace Creation: create a personal workspace for documents and files.
- Business Workspace Creation: convert or create business workspace with company metadata.
- Initial Onboarding: guided tour introducing dashboard, folders, upload, storage, and sharing.
- Plan Selection: show available plan options and recommended upgrades.
- Welcome Screen: final success state after registration and onboarding completion.
- First-Time Dashboard: personalized dashboard view for newly activated users.

## C. Main user dashboard pages
## Main user dashboard pages

1. Dashboard Overview
2. My Files
3. All Files
4. My Folders
5. Folder Details
6. Recent Files
7. Starred Files
8. Shared With Me
9. Shared By Me
10. Trash / Recycle Bin
11. Storage Overview
12. Storage Management
13. Upload Manager
14. File Details
15. File Activity
16. File Version History
17. Notifications
18. Global Search Results


### Dashboard structure
The authenticated dashboard should be modular so that each page is trackable, optimized for search, and permission-aware.

- Dashboard Overview: summary of storage, recent files, shared content, notifications, and quota status.
- My Files: all files owned by the authenticated user within the current personal workspace.
- All Files: cross-folder view of the current workspace, including folders and files together.
- My Folders: list and manage root-level folders with state badges for protected or shared folders.
- Folder Details: folder metadata, nested contents, security state, permissions, and audit trail.
- Recent Files: recently modified or opened files ranked by recency.
- Starred Files: all favorite files used for quick access.
- Shared With Me: files and folders shared by others that are accessible to current user.
- Shared By Me: current user’s outbound shares with recipients and public links.
- Trash / Recycle Bin: soft-deleted items retained for a retention window before permanent purge.
- Storage Overview: quota consumed, remaining allowance, archive status, and warnings.
- Storage Management: upgrade, buy additional allowance, and clean storage categories.
- Upload Manager: current uploads, pending uploads, error queue, retry and cancellation controls.
- File Details: metadata and info about ownership, size, type, version history, and location.
- File Activity: change events and file access events for auditing.
- File Version History: view versions and restore earlier revisions.
- Notifications: system notifications, alerts, and collaboration events.
- Global Search Results: full-text/metadata search across files, folders, and shared content.

## D. Folder management pages and screens
Folder management is a hybrid of full pages and reusable workflows.

### Full pages
- Folder Details
- Folder Activity
- Folder Access and Permissions

### Reusable dialogs, drawers, and popovers
- Create Folder Modal
- Create Subfolder Drawer
- Rename Folder Dialog
- Move Folder Dialog
- Delete Folder Modal
- Restore Folder Modal
- Lock Folder Dialog
- Unlock Folder Dialog
- Set Six-Digit PIN Drawer
- Change Folder PIN Dialog
- Recover Folder Access Dialog
- Folder Permissions Drawer
- Folder Sharing Drawer
- Folder Activity Popover

## E. Document workspace pages
## Document workspace pages

1. Document Workspace Shell
2. Word Document Viewer & Editor
3. Excel Viewer & Editor
4. PowerPoint Viewer & Editor
5. PDF Viewer
6. PDF Annotation Tools
7. TXT Editor
8. Image Viewer
9. Audio Player
10. Video Player
11. Unsupported File Preview
12. File Information Panel
13. Version History Interface
14. Save & Conflict Resolution


### File format assignment guidance
- Office documents: browser previews; lightweight browser editing for CSV/XLSX, PDF notes, and DOCX/PPTX text
- PDF: PDF.js for rendering and custom overlay tools for annotations
- TXT: custom text editor with browser save logic
- Images: custom image viewer and crop/annotation tools
- Audio/video: custom browser players with playback controls
- Unsupported files: generic preview fallback with metadata and download action

## F. Document scanner pages
## Document scanner pages

1. Scanner Home
2. Camera Permission
3. Camera Scanning Interface
4. Capture Document
5. Edge Detection & Cropping
6. Image Enhancement
7. Page Rotation
8. Multi-page Document Manager
9. Page Reordering
10. OCR Processing Status
11. PDF Preview
12. Save Scanned Document
13. Destination Folder Selection


## G. Sharing and collaboration pages
## Sharing and collaboration pages

1. Share File
2. Share Folder
3. Create Sharing Link
4. Sharing Link Settings
5. Password-Protected Sharing
6. Expiration Settings
7. Shared Files Management
8. Public / Recipient-Facing Shared File Access
9. Shared File Preview
10. Access Denied
11. Expired Link
12. Business Workspace
13. Team Members
14. Invite Members
15. Member Permissions
16. Shared Workspace Folders


## H. Subscription & billing pages
## Subscription and billing pages

1. Pricing Plans
2. Plan Comparison
3. Upgrade Subscription
4. Downgrade Subscription
5. Checkout
6. Payment Processing Status
7. Payment Success
8. Payment Failure
9. Subscription Overview
10. Payment History
11. Invoice List
12. Invoice Details
13. Billing Information
14. Subscription Renewal
15. Storage Upgrade
16. Subscription Expiry / Downgrade Notice


## I. User settings pages
## User settings pages

1. Profile Settings
2. Account Settings
3. Password & Security
4. Active Sessions
5. Notification Preferences
6. Storage Settings
7. Subscription Settings
8. Workspace Settings
9. Privacy Settings
10. Account Deletion
11. Account Recovery


## J. Business workspace pages
## Business workspace pages

1. Business Dashboard
2. Workspace Overview
3. Team Members
4. Invite Members
5. Member Management
6. Roles & Permissions
7. Shared Files
8. Shared Folders
9. Business Storage
10. Workspace Activity
11. Business Billing
12. Workspace Settings
13. Workspace Invitations
14. Folder-Level Permissions
15. Invitation Acceptance


## K. Super admin dashboard pages
## Super admin dashboard pages

1. Admin Overview
2. User Management
3. User Details
4. Account Suspension
5. Business Account Management
6. Subscription Management
7. Plan Management
8. Payment Management
9. Invoice Management
10. Storage Monitoring
11. Platform Storage Analytics
12. File and Upload Monitoring
13. Security Monitoring
14. Audit Logs
15. Notification Management
16. Platform Settings
17. Admin Roles and Permissions
18. System Health
19. Background Job Monitoring


## L. System & utility pages
## System and utility pages

1. 404 Page
2. 403 Access Denied
3. 500 Server Error
4. Maintenance Page
5. Offline State
6. Loading States
7. Empty States
8. No Search Results
9. Upload Failed
10. Storage Limit Reached
11. Session Expired
12. Account Suspended
13. Unsupported File Type
14. Invalid Sharing Link


## Overall page design principles
- Public pages should be optimized for conversion and trust.
- Auth flows should be mobile-first with strong validation and accessible, error-aware UX.
- Personal and business workspaces must remain visually separate without fragmenting the underlying file system.
- Document viewers and editors should behave like full workspace surfaces rather than simple modal previews.
- Utility states should be consistent across the app and tied to backend status codes when possible.
