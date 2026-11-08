import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PlatformAnnouncementsController } from './platform-announcements.controller';
import { PlatformAnnouncementsService } from './platform-announcements.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [PlatformAnnouncementsController],
  providers: [PlatformAnnouncementsService, SessionGuard],
})
export class PlatformAnnouncementsModule {}
