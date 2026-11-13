import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { MailerService } from '../auth/mailer.service';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminPermissionsGuard } from './platform-admin-permissions.guard';
import { AdminService } from './admin.service';
import { AnnouncementDeliveryWorker } from './announcement-delivery.worker';
import { AdminEmailDeliveryWorker } from './admin-email-delivery.worker';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { StorageModule } from '../storage/storage.module';
import { SupportTicketModule } from '../support/support-ticket.module';
import { AuthModule } from '../auth/auth.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [AuthModule, PlanCatalogueModule, StorageModule, SupportTicketModule, ReferralsModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    MailerService,
    AnnouncementDeliveryWorker,
    AdminEmailDeliveryWorker,
    SessionGuard,
    PlatformAdminGuard,
    PlatformAdminPermissionsGuard,
  ],
})
export class AdminModule {}
