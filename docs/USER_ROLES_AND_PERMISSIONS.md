# USER ROLES AND PERMISSIONS

## Role model
The platform distinguishes between subscription entitlements and workspace permissions. A user may have a free or paid plan while also holding member roles inside one or more business workspaces.

## Roles
| Role | Context | Key capabilities |
| --- | --- | --- |
| Free user | personal, plan-based | store files within 5GB allowance, basic private access |
| Basic subscriber | personal, plan-based | increased storage, basic sharing, more file activity |
| Pro subscriber | personal, plan-based | higher storage, advanced collaboration features |
| Business owner | workspace-level | full workspace control, billing, member management |
| Business administrator | workspace-level | manage members, roles, folder settings, share policies |
| Business member | workspace-level | access shared folders/files, upload, edit if permitted |
| Super admin | platform-wide | user management, storage analytics, platform billing, security controls |

## Permission matrix
| Action | Free user | Basic subscriber | Pro subscriber | Business owner | Business administrator | Business member | Super admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| View | Yes | Yes | Yes | Yes | Yes | Yes, if granted | Yes |
| Create | Yes | Yes | Yes | Yes | Yes | Yes, if granted | Yes |
| Upload | Yes, subject to quota | Yes | Yes | Yes | Yes | Yes, if granted | Yes |
| Edit | File-only if owner | File-only if owner | File-only if owner | Yes, scoped | Yes, scoped | Yes, if granted | Yes |
| Delete | Own data only | Own data only | Own data only | Workspace-scoped | Workspace-scoped | Yes, if granted | Yes |
| Share | Limited | Yes | Yes | Yes | Yes | Yes, if granted | Yes |
| Download | Yes | Yes | Yes | Yes | Yes | Yes, if granted | Yes |
| Lock | Own folders only | Own folders only | Own folders only | Yes | Yes | No | Yes |
| Manage | No | No | No | Yes | Yes, scoped | No | Yes |
| Administer | No | No | No | Yes | Partial | No | Yes |

## Security rule note
Subscription entitlements are not a substitute for workspace permissions. A Pro subscriber may still be denied access to a business workspace folder unless invited and granted permissions.
