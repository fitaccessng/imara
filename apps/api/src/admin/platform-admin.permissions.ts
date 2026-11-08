import { SetMetadata } from '@nestjs/common';
import { PlatformAdminRole } from '@prisma/client';

export enum PlatformAdminPermission {
  DASHBOARD_OVERVIEW_READ = 'admin.dashboard.overview.read',
  USERS_READ = 'admin.users.read',
  USER_STATUS_UPDATE = 'admin.users.status.update',
  USER_SESSION_REVOKE = 'admin.users.sessions.revoke',
  USER_PASSWORD_RESET = 'admin.users.password-reset',
  USER_VERIFICATION_RESEND = 'admin.users.verification-resend',
  BUSINESSES_READ = 'admin.businesses.read',
  STORAGE_INVENTORY_READ = 'admin.storage.inventory.read',
  EVENTS_READ = 'admin.events.read',
  ANALYTICS_READ = 'admin.analytics.read',
  PLAN_CATALOGUE_READ = 'admin.plans.read',
  PLAN_CATALOGUE_UPDATE = 'admin.plans.update',
  SUBSCRIPTIONS_READ = 'admin.subscriptions.read',
  PAYMENTS_READ = 'admin.payments.read',
  PLATFORM_ADMINS_READ = 'admin.platform-admins.read',
  PLATFORM_ADMINS_UPDATE = 'admin.platform-admins.update',
  ANNOUNCEMENTS_READ = 'admin.announcements.read',
  ANNOUNCEMENTS_SEND = 'admin.announcements.send',
  AUDIT_LOG_READ = 'admin.audit-log.read',
  UPLOAD_MONITORING_READ = 'admin.uploads.monitor.read',
  PLATFORM_HEALTH_READ = 'admin.platform-health.read',
  SUPPORT_TICKETS_READ = 'admin.support-tickets.read',
  SUPPORT_TICKETS_UPDATE = 'admin.support-tickets.update',
}

export const PLATFORM_ADMIN_PERMISSIONS: Readonly<
  Record<PlatformAdminRole, readonly PlatformAdminPermission[]>
> = {
  [PlatformAdminRole.SUPER_ADMIN]: Object.values(PlatformAdminPermission),
  [PlatformAdminRole.USER_MANAGEMENT_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.USERS_READ,
    PlatformAdminPermission.USER_STATUS_UPDATE,
    PlatformAdminPermission.USER_SESSION_REVOKE,
    PlatformAdminPermission.USER_PASSWORD_RESET,
    PlatformAdminPermission.USER_VERIFICATION_RESEND,
  ],
  [PlatformAdminRole.FINANCE_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.ANALYTICS_READ,
    PlatformAdminPermission.PLAN_CATALOGUE_READ,
    PlatformAdminPermission.PLAN_CATALOGUE_UPDATE,
    PlatformAdminPermission.SUBSCRIPTIONS_READ,
    PlatformAdminPermission.PAYMENTS_READ,
  ],
  [PlatformAdminRole.SUPPORT_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.USERS_READ,
    PlatformAdminPermission.USER_SESSION_REVOKE,
    PlatformAdminPermission.BUSINESSES_READ,
    PlatformAdminPermission.EVENTS_READ,
    PlatformAdminPermission.SUPPORT_TICKETS_READ,
    PlatformAdminPermission.SUPPORT_TICKETS_UPDATE,
  ],
  [PlatformAdminRole.MARKETING_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.ANNOUNCEMENTS_READ,
    PlatformAdminPermission.ANNOUNCEMENTS_SEND,
  ],
  [PlatformAdminRole.OPERATIONS_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.BUSINESSES_READ,
    PlatformAdminPermission.STORAGE_INVENTORY_READ,
    PlatformAdminPermission.UPLOAD_MONITORING_READ,
    PlatformAdminPermission.PLATFORM_HEALTH_READ,
    PlatformAdminPermission.EVENTS_READ,
  ],
  [PlatformAdminRole.SECURITY_ADMIN]: [
    PlatformAdminPermission.DASHBOARD_OVERVIEW_READ,
    PlatformAdminPermission.USERS_READ,
    PlatformAdminPermission.USER_STATUS_UPDATE,
    PlatformAdminPermission.USER_SESSION_REVOKE,
    PlatformAdminPermission.USER_PASSWORD_RESET,
    PlatformAdminPermission.USER_VERIFICATION_RESEND,
    PlatformAdminPermission.STORAGE_INVENTORY_READ,
    PlatformAdminPermission.UPLOAD_MONITORING_READ,
    PlatformAdminPermission.PLATFORM_HEALTH_READ,
    PlatformAdminPermission.AUDIT_LOG_READ,
  ],
};

export const PLATFORM_ADMIN_PERMISSION_METADATA = 'platformAdminPermission';
export const PLATFORM_ADMIN_PERMISSION_EXEMPT_METADATA =
  'platformAdminPermissionExempt';

export const RequirePlatformAdminPermission = (
  permission: PlatformAdminPermission,
) => SetMetadata(PLATFORM_ADMIN_PERMISSION_METADATA, permission);

export const AllowPlatformAdminWithoutDomainPermission = () =>
  SetMetadata(PLATFORM_ADMIN_PERMISSION_EXEMPT_METADATA, true);

export function roleHasPlatformAdminPermission(
  role: PlatformAdminRole,
  permission: PlatformAdminPermission,
): boolean {
  if (role === PlatformAdminRole.SUPER_ADMIN) return true;
  return PLATFORM_ADMIN_PERMISSIONS[role].includes(permission);
}
