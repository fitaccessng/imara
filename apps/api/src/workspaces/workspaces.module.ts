import { forwardRef, Module } from '@nestjs/common';
import { MailerService } from '../auth/mailer.service';
import { SessionGuard } from '../auth/session.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspaceStorageController } from './workspace-storage.controller';
import { WorkspacesService } from './workspaces.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { WorkspaceStorageService } from './workspace-storage.service';
import { WorkspaceChatController } from './workspace-chat.controller';
import { WorkspaceChatService } from './workspace-chat.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarReminderWorker } from './calendar-reminder.worker';
import { FileDeliveryService } from './file-delivery.service';
import { PersonalNotificationsModule } from '../notifications/personal-notifications.module';
import { ProductivityController } from './productivity.controller';
import { ProductivityService } from './productivity.service';
import { MeetingsService } from '../meetings/meetings.service';
import { PersonalMeetingsController, WorkspaceMeetingsController } from '../meetings/meetings.controller';
import { WorkspaceFormsService } from '../forms/workspace-forms.service';
import { PublicWorkspaceFormsController, WorkspaceFormsController } from '../forms/workspace-forms.controller';

@Module({
  imports: [PrismaModule, PlanCatalogueModule, forwardRef(() => PersonalNotificationsModule)],
  controllers: [WorkspacesController, WorkspaceStorageController, WorkspaceChatController, CalendarController, ProductivityController, PersonalMeetingsController, WorkspaceMeetingsController, WorkspaceFormsController, PublicWorkspaceFormsController],
  providers: [
    WorkspacesService, WorkspaceStorageService, WorkspaceChatService, CalendarService, CalendarReminderWorker, FileDeliveryService,
    ObjectStorageService, MailerService, SessionGuard, ProductivityService, MeetingsService, WorkspaceFormsService,
  ],
  exports: [WorkspacesService, WorkspaceStorageService, WorkspaceChatService, ObjectStorageService],
})
export class WorkspacesModule {}
