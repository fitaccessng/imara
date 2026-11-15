import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { DocumentsController, PublicDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [DocumentsController, PublicDocumentsController],
  providers: [DocumentsService, SessionGuard],
})
export class DocumentsModule {}
