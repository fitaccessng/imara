import { Controller, Get } from '@nestjs/common';
import { PlanCatalogueService } from './plan-catalogue.service';

@Controller('plans')
export class PlanCatalogueController {
  constructor(private readonly plans: PlanCatalogueService) {}

  @Get()
  list() {
    return this.plans.publicCatalogue();
  }
}
