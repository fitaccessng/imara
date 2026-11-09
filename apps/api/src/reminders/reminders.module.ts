import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RemindersController } from './reminders.controller';
import { ReminderDeliveryWorker } from './reminder-delivery.worker';
import { RemindersService } from './reminders.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule],
  controllers: [RemindersController],
  providers: [ReminderDeliveryWorker, RemindersService],
})
export class RemindersModule {}
