import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [InsightsController],
  providers: [InsightsService, SessionGuard],
})
export class InsightsModule {}
