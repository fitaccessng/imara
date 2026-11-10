import { Module } from '@nestjs/common';
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
import { FileDeliveryService } from './file-delivery.service';

@Module({
  imports: [PrismaModule, PlanCatalogueModule],
  controllers: [WorkspacesController, WorkspaceStorageController, WorkspaceChatController, CalendarController],
  providers: [
    WorkspacesService, WorkspaceStorageService, WorkspaceChatService, CalendarService, FileDeliveryService,
    ObjectStorageService, MailerService, SessionGuard,
  ],
  exports: [WorkspacesService, WorkspaceStorageService, WorkspaceChatService, ObjectStorageService],
})
export class WorkspacesModule {}
