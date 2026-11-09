import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [PrismaModule, PlanCatalogueModule, WorkspacesModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, SessionGuard],
})
export class ApprovalsModule {}
