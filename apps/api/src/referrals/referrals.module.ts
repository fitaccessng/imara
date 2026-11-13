import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, SessionGuard],
  exports: [ReferralsService],
})
export class ReferralsModule {}
