import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { StorageModule } from './storage.module';
import { FileRequestsController } from './file-requests.controller';
import { FileRequestsService } from './file-requests.service';

@Module({
  imports: [StorageModule, PlanCatalogueModule],
  controllers: [FileRequestsController],
  providers: [FileRequestsService, SessionGuard],
})
export class FileRequestsModule {}
