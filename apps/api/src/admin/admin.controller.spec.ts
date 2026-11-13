import 'reflect-metadata';

jest.mock('@nestjs/common', () => ({
  Controller: () => () => undefined,
  Body: () => () => undefined,
  Delete: () => () => undefined,
  Get: () => () => undefined,
  HttpCode: () => () => undefined,
  HttpStatus: { ACCEPTED: 202, NO_CONTENT: 204 },
  Param: () => () => undefined,
  ParseEnumPipe: class ParseEnumPipe {},
  ParseUUIDPipe: class ParseUUIDPipe {},
  Patch: () => () => undefined,
  Post: () => () => undefined,
  Query: () => () => undefined,
  Injectable: () => () => undefined,
  Req: () => () => undefined,
  SetMetadata: () => () => undefined,
  UseGuards: () => () => undefined,
}));
jest.mock('@nestjs/core', () => ({ Reflector: class Reflector {} }));
jest.mock('@nestjs/throttler', () => ({ Throttle: () => () => undefined }));
jest.mock('../auth/session.guard', () => ({ SessionGuard: class SessionGuard {} }));
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));
jest.mock('./platform-admin.guard', () => ({ PlatformAdminGuard: class PlatformAdminGuard {} }));
jest.mock('./platform-admin-permissions.guard', () => ({
  PlatformAdminPermissionsGuard: class PlatformAdminPermissionsGuard {},
}));
jest.mock('./admin.service', () => ({ AdminService: class AdminService {} }));
jest.mock('../support/support-ticket.service', () => ({ SupportTicketService: class SupportTicketService {} }));

import { UserRole } from '@prisma/client';
import type { AuthService } from '../auth/auth.service';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { SupportTicketService } from '../support/support-ticket.service';

describe('AdminController', () => {
  it('returns the authenticated platform-admin identity without exposing verification internals', () => {
    const controller = new AdminController(
      {} as AdminService,
      {} as SupportTicketService,
      {} as AuthService,
    );
    const verifiedAt = new Date();

    expect(controller.me({
      platformAdmin: {
        id: 'admin-id',
        email: 'admin@example.test',
        name: 'Admin',
        role: UserRole.ADMIN,
        emailVerifiedAt: verifiedAt,
        platformAdminProfile: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      },
    } as unknown as Parameters<AdminController['me']>[0])).toEqual({
      id: 'admin-id',
      email: 'admin@example.test',
      name: 'Admin',
      role: UserRole.ADMIN,
      emailVerified: true,
      platformAdminRole: 'SUPER_ADMIN',
    });
  });

  it('delegates lifecycle, session, and metadata endpoints to the service', async () => {
    const adminService = {
      storageInventory: jest.fn().mockResolvedValue({ summary: {} }),
      analytics: jest.fn().mockResolvedValue({ registrationsByDay: [] }),
      events: jest.fn().mockResolvedValue({ items: [], page: {} }),
      plans: jest.fn().mockResolvedValue({ plans: [] }),
      updatePlan: jest.fn().mockResolvedValue({ plan: 'PRO' }),
      subscriptions: jest.fn().mockResolvedValue({ items: [], page: {} }),
      payments: jest.fn().mockResolvedValue({ items: [], revenueByCurrency: [] }),
      platformAdminPermissions: jest.fn().mockResolvedValue({ roles: [] }),
      platformAdmins: jest.fn().mockResolvedValue({ items: [], page: {} }),
      updatePlatformAdmin: jest.fn().mockResolvedValue({ userId: 'admin-id' }),
      userDetails: jest.fn().mockResolvedValue({ id: 'user-id' }),
      auditPasswordResetRequest: jest.fn().mockResolvedValue(undefined),
      auditVerificationResendRequest: jest.fn().mockResolvedValue(undefined),
      setUserStatus: jest.fn().mockResolvedValue({ id: 'user-id', status: 'SUSPENDED' }),
      revokeUserSession: jest.fn().mockResolvedValue(undefined),
      businessDetails: jest.fn().mockResolvedValue({ id: 'workspace-id' }),
      uploadMonitoring: jest.fn().mockResolvedValue({ byStatus: {} }),
      systemHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      announcements: jest.fn().mockResolvedValue({ items: [], page: {} }),
      announcementRecipients: jest.fn().mockResolvedValue({ items: [], page: {} }),
      createAnnouncement: jest.fn().mockResolvedValue({ id: 'announcement-id' }),
      emailComposerRecipients: jest.fn().mockResolvedValue({ items: [], page: {} }),
      emailComposerCampaignStatus: jest.fn().mockResolvedValue({ campaignId: 'campaign-id' }),
      sendComposedEmail: jest.fn().mockResolvedValue({ campaignId: 'campaign-id', status: 'QUEUED' }),
      retryAnnouncementEmail: jest.fn().mockResolvedValue({ queuedRecipientCount: 0 }),
      archiveAnnouncement: jest.fn().mockResolvedValue({ id: 'announcement-id', archivedAt: new Date() }),
      restoreAnnouncement: jest.fn().mockResolvedValue({ id: 'announcement-id', archivedAt: null }),
    };
    const supportService = {
      adminList: jest.fn().mockResolvedValue({ items: [], page: {} }),
      adminAgents: jest.fn().mockResolvedValue([]),
      adminDetails: jest.fn().mockResolvedValue({ id: 'ticket-id' }),
      update: jest.fn().mockResolvedValue({ id: 'ticket-id' }),
      addAdminMessage: jest.fn().mockResolvedValue({ id: 'message-id' }),
    };
    const authService = {
      requestPasswordResetForUser: jest.fn().mockResolvedValue(undefined),
      resendVerificationForUser: jest.fn().mockResolvedValue(true),
    };
    const controller = new AdminController(
      adminService as unknown as AdminService,
      supportService as unknown as SupportTicketService,
      authService as unknown as AuthService,
    );
    const request = {} as Parameters<AdminController['userDetails']>[1];

    await expect(controller.storageInventory(request)).resolves.toEqual({ summary: {} });
    await expect(controller.analytics({ from: '2026-01-01' } as never, request))
      .resolves.toEqual({ registrationsByDay: [] });
    await expect(controller.events({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.plans(request)).resolves.toEqual({ plans: [] });
    await expect(controller.updatePlan('PRO' as never, {} as never, request))
      .resolves.toEqual({ plan: 'PRO' });
    await expect(controller.subscriptions({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.payments({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], revenueByCurrency: [] });
    await expect(controller.platformAdminPermissions(request)).resolves.toEqual({ roles: [] });
    await expect(controller.platformAdmins({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.updatePlatformAdmin('admin-id', {} as never, request))
      .resolves.toEqual({ userId: 'admin-id' });
    await expect(controller.userDetails('user-id', request)).resolves.toEqual({ id: 'user-id' });
    await expect(controller.requestUserPasswordReset('user-id', request)).resolves.toEqual({
      message: 'A password reset code was sent to the customer email address.',
    });
    expect(adminService.auditPasswordResetRequest).toHaveBeenCalledWith('user-id', request);
    expect(authService.requestPasswordResetForUser).toHaveBeenCalledWith('user-id');
    await expect(controller.resendUserVerification('user-id', request)).resolves.toEqual({
      sent: true,
      message: 'A verification code was sent to the customer email address.',
    });
    expect(adminService.auditVerificationResendRequest).toHaveBeenCalledWith('user-id', request);
    expect(authService.resendVerificationForUser).toHaveBeenCalledWith('user-id');
    await expect(controller.setUserStatus('user-id', { status: 'SUSPENDED' } as never, request))
      .resolves.toEqual({ id: 'user-id', status: 'SUSPENDED' });
    await expect(controller.revokeUserSession('user-id', 'session-id', request))
      .resolves.toBeUndefined();
    await expect(controller.businessDetails('workspace-id', request))
      .resolves.toEqual({ id: 'workspace-id' });
    const uploadQuery = { page: 1, pageSize: 25 };
    await expect(controller.uploadMonitoring(uploadQuery as never, request)).resolves.toEqual({ byStatus: {} });
    await expect(controller.systemHealth(request)).resolves.toEqual({ status: 'healthy' });
    await expect(controller.announcements({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.archiveAnnouncement('announcement-id', request))
      .resolves.toMatchObject({ id: 'announcement-id', archivedAt: expect.any(Date) });
    await expect(controller.restoreAnnouncement('announcement-id', request))
      .resolves.toEqual({ id: 'announcement-id', archivedAt: null });
    await expect(controller.announcementRecipients({ q: 'sample' } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.createAnnouncement({} as never, request)).resolves.toEqual({ id: 'announcement-id' });
    await expect(controller.emailComposerRecipients({ filter: 'ALL' } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.emailComposerCampaignStatus('campaign-id', request))
      .resolves.toEqual({ campaignId: 'campaign-id' });
    await expect(controller.sendComposedEmail({} as never, request))
      .resolves.toEqual({ campaignId: 'campaign-id', status: 'QUEUED' });
    await expect(controller.retryAnnouncementEmail('announcement-id', request))
      .resolves.toEqual({ queuedRecipientCount: 0 });
    await expect(controller.supportTicketsList({ page: 1, pageSize: 10 } as never, request))
      .resolves.toEqual({ items: [], page: {} });
    await expect(controller.supportAgents(request)).resolves.toEqual([]);
    await expect(controller.supportTicketDetails('ticket-id', request)).resolves.toEqual({ id: 'ticket-id' });
    await expect(controller.updateSupportTicket('ticket-id', {} as never, request))
      .resolves.toEqual({ id: 'ticket-id' });
    await expect(controller.replyToSupportTicket('ticket-id', {} as never, request))
      .resolves.toEqual({ id: 'message-id' });

    expect(adminService.userDetails).toHaveBeenCalledWith('user-id', request);
    expect(adminService.storageInventory).toHaveBeenCalledWith(request);
    expect(adminService.analytics).toHaveBeenCalledWith({ from: '2026-01-01' }, request);
    expect(adminService.events).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, request);
    expect(adminService.plans).toHaveBeenCalledWith(request);
    expect(adminService.updatePlan).toHaveBeenCalledWith('PRO', {}, request);
    expect(adminService.setUserStatus).toHaveBeenCalledWith('user-id', 'SUSPENDED', request);
    expect(adminService.revokeUserSession).toHaveBeenCalledWith('user-id', 'session-id', request);
    expect(adminService.businessDetails).toHaveBeenCalledWith('workspace-id', request);
    expect(adminService.uploadMonitoring).toHaveBeenCalledWith(uploadQuery, request);
    expect(adminService.systemHealth).toHaveBeenCalledWith(request);
    expect(supportService.adminList).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, request);
    expect(supportService.adminAgents).toHaveBeenCalledWith(request);
  });
});
