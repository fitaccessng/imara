import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { BillingController } from './billing.controller';
import { BachsPaymentService } from './bachs-payment.service';

@Module({
  imports: [AuthModule, PlanCatalogueModule],
  controllers: [BillingController],
  providers: [BachsPaymentService],
})
export class BillingModule {}
