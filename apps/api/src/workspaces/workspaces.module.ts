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

@Module({
  imports: [PrismaModule, PlanCatalogueModule],
  controllers: [WorkspacesController, WorkspaceStorageController],
  providers: [WorkspacesService, WorkspaceStorageService, ObjectStorageService, MailerService, SessionGuard],
  exports: [WorkspacesService, WorkspaceStorageService, ObjectStorageService],
})
export class WorkspacesModule {}
