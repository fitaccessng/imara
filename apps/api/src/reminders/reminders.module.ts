import { Module } from '@nestjs/common';
import { MailerService } from '../auth/mailer.service';
import { SessionGuard } from '../auth/session.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RemindersController } from './reminders.controller';
import { ReminderDeliveryWorker } from './reminder-delivery.worker';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PrismaModule, PlanCatalogueModule, WorkspacesModule],
  controllers: [RemindersController],
  providers: [ReminderDeliveryWorker, RemindersService, SessionGuard, MailerService],
})
export class RemindersModule {}
