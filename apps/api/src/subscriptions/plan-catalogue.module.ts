import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanCatalogueController } from './plan-catalogue.controller';
import { PlanCatalogueService } from './plan-catalogue.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanCatalogueController],
  providers: [PlanCatalogueService],
  exports: [PlanCatalogueService],
})
export class PlanCatalogueModule {}
