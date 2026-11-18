import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanCatalogueController } from './plan-catalogue.controller';
import { PlanCatalogueService } from './plan-catalogue.service';
import { WorkspaceSubscriptionService } from './workspace-subscription.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanCatalogueController],
  providers: [PlanCatalogueService, WorkspaceSubscriptionService],
  exports: [PlanCatalogueService, WorkspaceSubscriptionService],
})
export class PlanCatalogueModule {}
