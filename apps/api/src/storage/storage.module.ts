import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { StorageController } from './storage.controller';
import { ObjectStorageService } from './object-storage.service';
import { StorageService } from './storage.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [StorageController],
  providers: [StorageService, ObjectStorageService, SessionGuard],
  exports: [StorageService, ObjectStorageService],
})
export class StorageModule {}
