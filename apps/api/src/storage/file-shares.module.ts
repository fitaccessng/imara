import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { FileSharesController } from './file-shares.controller';
import { FileSharesService } from './file-shares.service';

@Module({
  imports: [WorkspacesModule, PlanCatalogueModule],
  controllers: [FileSharesController],
  providers: [FileSharesService, SessionGuard],
})
export class FileSharesModule {}
