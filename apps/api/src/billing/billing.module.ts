import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { BillingController } from './billing.controller';
import { BachsPaymentService } from './bachs-payment.service';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [BillingController],
  providers: [BachsPaymentService, SessionGuard],
})
export class BillingModule {}
