import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { FileSharesModule } from './storage/file-shares.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { EventsModule } from './events/events.module';
import { AdminModule } from './admin/admin.module';
import { PlanCatalogueModule } from './subscriptions/plan-catalogue.module';
import { BillingModule } from './billing/billing.module';
import { PlatformAnnouncementsModule } from './announcements/platform-announcements.module';
import { SupportTicketModule } from './support/support-ticket.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { RemindersModule } from './reminders/reminders.module';
import { SignaturesModule } from './signatures/signatures.module';
import { ReferralsModule } from './referrals/referrals.module';
import { HealthController } from './health.controller';
import { ApiErrorLoggingInterceptor } from './api-error-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../.env'), resolve(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]) as unknown as DynamicModule,
    PrismaModule,
    PlanCatalogueModule,
    AuthModule,
    StorageModule,
    FileSharesModule,
    WorkspacesModule,
    EventsModule,
    AdminModule,
    BillingModule,
    PlatformAnnouncementsModule,
    SupportTicketModule,
    ApprovalsModule,
    RemindersModule,
    SignaturesModule,
    ReferralsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiErrorLoggingInterceptor },
  ],
})
export class AppModule {}
