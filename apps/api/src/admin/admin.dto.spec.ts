import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EventGallerySetting,
  EventStatus,
  PaymentAttemptStatus,
  Plan,
  PlatformAdminRole,
  PlatformAdminStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  UserAccountStatus,
} from '@prisma/client';
import {
  AdminAnnouncementCreateDto,
  AdminAnalyticsQueryDto,
  AdminEventsQueryDto,
  AdminPaymentsQueryDto,
  AdminPageQueryDto,
  AdminPlatformAdminUpdateDto,
  AdminPlanCatalogueUpdateDto,
  AdminSubscriptionsQueryDto,
  AdminSupportTicketUpdateDto,
  AdminSupportTicketsQueryDto,
  AdminUserStatusDto,
  SupportTicketCreateDto,
} from './admin.dto';

describe('admin directory query validation', () => {
  it('transforms valid pagination defaults and trims bounded search text', async () => {
    const query = plainToInstance(AdminPageQueryDto, {
      page: '2',
      pageSize: '50',
      q: '  studio  ',
    });
    expect(query).toMatchObject({ page: 2, pageSize: 50, q: 'studio' });
    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it('rejects invalid and oversized page parameters', async () => {
    const query = plainToInstance(AdminPageQueryDto, {
      page: '0',
      pageSize: '101',
      q: 'x'.repeat(101),
    });
    expect((await validate(query)).length).toBeGreaterThan(0);
  });

  it('accepts only persisted account status values', async () => {
    const suspended = plainToInstance(AdminUserStatusDto, { status: 'SUSPENDED' });
    const invalid = plainToInstance(AdminUserStatusDto, { status: 'DELETED' });

    await expect(validate(suspended)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(1);
    expect(UserAccountStatus.SUSPENDED).toBe('SUSPENDED');
  });

  it('validates event filters against persisted event and gallery enums', async () => {
    const valid = plainToInstance(AdminEventsQueryDto, {
      page: '2',
      pageSize: '10',
      q: 'gala',
      status: EventStatus.ACTIVE,
      gallerySetting: EventGallerySetting.PASSCODE,
    });
    const invalid = plainToInstance(AdminEventsQueryDto, {
      status: 'COMPLETED',
      gallerySetting: 'PUBLIC',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });

  it('accepts bounded ISO date range query fields and rejects malformed dates', async () => {
    const valid = plainToInstance(AdminAnalyticsQueryDto, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    const invalid = plainToInstance(AdminAnalyticsQueryDto, {
      from: 'yesterday',
      to: 'noon',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });

  it('validates complete plan entitlement updates and integer minor-unit prices', async () => {
    const valid = plainToInstance(AdminPlanCatalogueUpdateDto, {
      staffLimit: 12,
      activeEventLimit: 8,
      storageLimitBytes: '21474836480',
      canEditDocuments: true,
      canScanDocuments: false,
      advancedTeamManagement: true,
      monthlyPriceMinor: '750000',
    });

    const invalid = plainToInstance(AdminPlanCatalogueUpdateDto, {
      staffLimit: -1,
      activeEventLimit: '8',
      storageLimitBytes: '20GB',
      canEditDocuments: 'yes',
      canScanDocuments: false,
      advancedTeamManagement: true,
      monthlyPriceMinor: '12.50',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });

  it('validates subscription and payment filters and administrator access updates', async () => {
    const subscriptions = plainToInstance(AdminSubscriptionsQueryDto, {
      page: '2',
      pageSize: '10',
      plan: Plan.PRO,
      q: '  customer@example.test  ',
    });
    const payments = plainToInstance(AdminPaymentsQueryDto, {
      status: PaymentAttemptStatus.SUCCEEDED,
      plan: Plan.BUSINESS,
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    const invalidFilter = plainToInstance(AdminPaymentsQueryDto, { status: 'REFUNDED' });
    const update = plainToInstance(AdminPlatformAdminUpdateDto, {
      role: PlatformAdminRole.FINANCE_ADMIN,
      status: PlatformAdminStatus.ACTIVE,
    });
    const invalidUpdate = plainToInstance(AdminPlatformAdminUpdateDto, {
      role: 'OWNER',
      status: 'REMOVED',
    });

    await expect(validate(subscriptions)).resolves.toHaveLength(0);
    await expect(validate(payments)).resolves.toHaveLength(0);
    expect((await validate(invalidFilter)).length).toBeGreaterThan(0);
    await expect(validate(update)).resolves.toHaveLength(0);
    expect((await validate(invalidUpdate)).length).toBeGreaterThan(0);
  });

  it('validates announcement content, audience, and email delivery choice', async () => {
    const valid = plainToInstance(AdminAnnouncementCreateDto, {
      title: '  Service update  ',
      body: '  A product improvement is now available.  ',
      audience: 'PRO',
      target: 'AUDIENCE',
      emailEnabled: true,
    });
    const invalid = plainToInstance(AdminAnnouncementCreateDto, {
      title: '',
      body: '',
      audience: 'ENTERPRISE',
      target: 'UNKNOWN',
      emailEnabled: 'yes',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({
      title: 'Service update',
      body: 'A product improvement is now available.',
    });
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });

  it('keeps existing announcement callers on the default audience target', async () => {
    const announcement = plainToInstance(AdminAnnouncementCreateDto, {
      title: 'Update',
      body: 'A message for customers',
      audience: 'ALL',
      emailEnabled: false,
    });

    expect(announcement.target).toBe('AUDIENCE');
    await expect(validate(announcement)).resolves.toHaveLength(0);
  });

  it('rejects a null signup window instead of treating it as an unfiltered target', async () => {
    const announcement = plainToInstance(AdminAnnouncementCreateDto, {
      title: 'Welcome',
      body: 'Thanks for joining',
      audience: 'ALL',
      target: 'SIGNUP_WINDOW',
      signupWindowMinutes: null,
      emailEnabled: false,
    });

    expect((await validate(announcement)).length).toBeGreaterThan(0);
  });

  it('validates customer tickets and admin ticket filters and updates', async () => {
    const create = plainToInstance(SupportTicketCreateDto, {
      subject: '  Upload problem  ',
      category: SupportTicketCategory.FILES,
      body: '  My upload did not finish.  ',
    });
    const query = plainToInstance(AdminSupportTicketsQueryDto, {
      page: '2',
      status: SupportTicketStatus.OPEN,
      priority: SupportTicketPriority.URGENT,
    });
    const update = plainToInstance(AdminSupportTicketUpdateDto, {
      status: SupportTicketStatus.PENDING,
      priority: SupportTicketPriority.HIGH,
      assignedAdminId: '4e345489-2235-4e56-a74a-aae5a6821546',
    });
    const invalid = plainToInstance(AdminSupportTicketUpdateDto, {
      status: 'CLOSED',
      priority: 'CRITICAL',
      assignedAdminId: 'not-an-id',
    });

    await expect(validate(create)).resolves.toHaveLength(0);
    await expect(validate(query)).resolves.toHaveLength(0);
    await expect(validate(update)).resolves.toHaveLength(0);
    expect(create.subject).toBe('Upload problem');
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });
});
