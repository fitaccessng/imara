import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { PersonalNotificationsController } from './personal-notifications.controller';

@Module({
  imports: [AuthModule, PlanCatalogueModule, PrismaModule],
  controllers: [PersonalNotificationsController],
})
export class PersonalNotificationsModule {}
