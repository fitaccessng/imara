import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { StorageModule } from '../storage/storage.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [StorageModule, PlanCatalogueModule],
  controllers: [EventsController],
  providers: [EventsService, SessionGuard],
})
export class EventsModule {}
