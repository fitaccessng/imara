import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Plan, UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminPermissionsGuard } from './platform-admin-permissions.guard';
import {
  AllowPlatformAdminWithoutDomainPermission,
  PlatformAdminPermission,
  RequirePlatformAdminPermission,
} from './platform-admin.permissions';
import type { PlatformAdminRequest } from './platform-admin.types';
import { AdminService } from './admin.service';
import {
  AdminAnalyticsQueryDto,
  AdminAuditQueryDto,
  AdminAnnouncementCreateDto,
  AdminAnnouncementRecipientsQueryDto,
  AdminEventsQueryDto,
  AdminPaymentsQueryDto,
  AdminPlatformAdminUpdateDto,
  AdminSupportTicketUpdateDto,
  AdminSupportTicketsQueryDto,
  AdminPageQueryDto,
  AdminPlanCatalogueUpdateDto,
  AdminSubscriptionsQueryDto,
  AdminUserStatusDto,
  SupportTicketMessageDto,
} from './admin.dto';
import { SupportTicketService } from '../support/support-ticket.service';

export interface PlatformAdminIdentity {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: 'ADMIN';
  platformAdminRole: string;
}

@Controller('admin')
@UseGuards(SessionGuard, PlatformAdminGuard, PlatformAdminPermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly supportTickets: SupportTicketService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  @AllowPlatformAdminWithoutDomainPermission()
  me(@Req() request: PlatformAdminRequest): PlatformAdminIdentity {
    const { id, email, name, emailVerifiedAt } = request.platformAdmin;
    return {
      id,
      email,
      name,
      emailVerified: Boolean(emailVerifiedAt),
      role: 'ADMIN',
      platformAdminRole: request.platformAdmin.platformAdminProfile.role,
    };
  }

  @Get('overview')
  @RequirePlatformAdminPermission(PlatformAdminPermission.DASHBOARD_OVERVIEW_READ)
  overview(@Req() request: PlatformAdminRequest) {
    return this.admin.overview(request);
  }

  @Get('storage-inventory')
  @RequirePlatformAdminPermission(PlatformAdminPermission.STORAGE_INVENTORY_READ)
  storageInventory(@Req() request: PlatformAdminRequest) {
    return this.admin.storageInventory(request);
  }

  @Get('upload-monitoring')
  @RequirePlatformAdminPermission(PlatformAdminPermission.UPLOAD_MONITORING_READ)
  uploadMonitoring(@Req() request: PlatformAdminRequest) {
    return this.admin.uploadMonitoring(request);
  }

  @Get('system-health')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLATFORM_HEALTH_READ)
  systemHealth(@Req() request: PlatformAdminRequest) {
    return this.admin.systemHealth(request);
  }

  @Get('analytics')
  @RequirePlatformAdminPermission(PlatformAdminPermission.ANALYTICS_READ)
  analytics(
    @Query() query: AdminAnalyticsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.analytics(query, request);
  }

  @Get('plans')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLAN_CATALOGUE_READ)
  plans(@Req() request: PlatformAdminRequest) {
    return this.admin.plans(request);
  }

  @Patch('plans/:plan')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLAN_CATALOGUE_UPDATE)
  updatePlan(
    @Param('plan', new ParseEnumPipe(Plan)) plan: Plan,
    @Body() dto: AdminPlanCatalogueUpdateDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.updatePlan(plan, dto, request);
  }

  @Get('subscriptions')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUBSCRIPTIONS_READ)
  subscriptions(
    @Query() query: AdminSubscriptionsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.subscriptions(query, request);
  }

  @Get('payments')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PAYMENTS_READ)
  payments(
    @Query() query: AdminPaymentsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.payments(query, request);
  }

  @Get('platform-admins/permissions')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLATFORM_ADMINS_READ)
  platformAdminPermissions(@Req() request: PlatformAdminRequest) {
    return this.admin.platformAdminPermissions(request);
  }

  @Get('platform-admins')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLATFORM_ADMINS_READ)
  platformAdmins(
    @Query() query: AdminPageQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.platformAdmins(query, request);
  }

  @Patch('platform-admins/:userId')
  @RequirePlatformAdminPermission(PlatformAdminPermission.PLATFORM_ADMINS_UPDATE)
  updatePlatformAdmin(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminPlatformAdminUpdateDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.updatePlatformAdmin(userId, dto, request);
  }

  @Get('announcements')
  @RequirePlatformAdminPermission(PlatformAdminPermission.ANNOUNCEMENTS_READ)
  announcements(@Query() query: AdminPageQueryDto, @Req() request: PlatformAdminRequest) {
    return this.admin.announcements(query, request);
  }

  @Get('announcements/recipients')
  @RequirePlatformAdminPermission(PlatformAdminPermission.ANNOUNCEMENTS_READ)
  announcementRecipients(
    @Query() query: AdminAnnouncementRecipientsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.announcementRecipients(query, request);
  }

  @Post('announcements')
  @RequirePlatformAdminPermission(PlatformAdminPermission.ANNOUNCEMENTS_SEND)
  createAnnouncement(@Body() dto: AdminAnnouncementCreateDto, @Req() request: PlatformAdminRequest) {
    return this.admin.createAnnouncement(dto, request);
  }

  @Post('announcements/:id/retry-email')
  @RequirePlatformAdminPermission(PlatformAdminPermission.ANNOUNCEMENTS_SEND)
  retryAnnouncementEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.retryAnnouncementEmail(id, request);
  }

  @Get('users')
  @RequirePlatformAdminPermission(PlatformAdminPermission.USERS_READ)
  users(
    @Query() query: AdminPageQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.users(query, request);
  }

  @Get('users/:id')
  @RequirePlatformAdminPermission(PlatformAdminPermission.USERS_READ)
  userDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.userDetails(id, request);
  }

  @Patch('users/:id/status')
  @RequirePlatformAdminPermission(PlatformAdminPermission.USER_STATUS_UPDATE)
  setUserStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminUserStatusDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.setUserStatus(id, dto.status, request);
  }

  @Post('users/:id/password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePlatformAdminPermission(PlatformAdminPermission.USER_PASSWORD_RESET)
  async requestUserPasswordReset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    await this.admin.auditPasswordResetRequest(id, request);
    await this.auth.requestPasswordResetForUser(id);
    return { message: 'A password reset code was sent to the customer email address.' };
  }

  @Post('users/:id/verification-email')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePlatformAdminPermission(PlatformAdminPermission.USER_VERIFICATION_RESEND)
  async resendUserVerification(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    await this.admin.auditVerificationResendRequest(id, request);
    const sent = await this.auth.resendVerificationForUser(id);
    return {
      sent,
      message: sent
        ? 'A verification code was sent to the customer email address.'
        : 'This customer email is already verified.',
    };
  }

  @Delete('users/:userId/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePlatformAdminPermission(PlatformAdminPermission.USER_SESSION_REVOKE)
  async revokeUserSession(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Req() request: PlatformAdminRequest,
  ): Promise<void> {
    await this.admin.revokeUserSession(userId, sessionId, request);
  }

  @Get(['businesses', 'workspaces'])
  @RequirePlatformAdminPermission(PlatformAdminPermission.BUSINESSES_READ)
  businesses(
    @Query() query: AdminPageQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.businesses(query, request);
  }

  @Get(['businesses/:id', 'workspaces/:id'])
  @RequirePlatformAdminPermission(PlatformAdminPermission.BUSINESSES_READ)
  businessDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.businessDetails(id, request);
  }

  @Get('events')
  @RequirePlatformAdminPermission(PlatformAdminPermission.EVENTS_READ)
  events(
    @Query() query: AdminEventsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.events(query, request);
  }

  @Get('support-tickets')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUPPORT_TICKETS_READ)
  supportTicketsList(
    @Query() query: AdminSupportTicketsQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.supportTickets.adminList(query, request);
  }

  @Get('support-agents')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUPPORT_TICKETS_READ)
  supportAgents(@Req() request: PlatformAdminRequest) {
    return this.supportTickets.adminAgents(request);
  }

  @Get('support-tickets/:id')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUPPORT_TICKETS_READ)
  supportTicketDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.supportTickets.adminDetails(id, request);
  }

  @Patch('support-tickets/:id')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUPPORT_TICKETS_UPDATE)
  updateSupportTicket(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminSupportTicketUpdateDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.supportTickets.update(id, dto, request);
  }

  @Post('support-tickets/:id/messages')
  @RequirePlatformAdminPermission(PlatformAdminPermission.SUPPORT_TICKETS_UPDATE)
  replyToSupportTicket(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupportTicketMessageDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.supportTickets.addAdminMessage(id, dto, request);
  }

  @Get('audit-logs')
  @RequirePlatformAdminPermission(PlatformAdminPermission.AUDIT_LOG_READ)
  auditLogs(
    @Query() query: AdminAuditQueryDto,
    @Req() request: PlatformAdminRequest,
  ) {
    return this.admin.auditLogs(query, request);
  }
}
