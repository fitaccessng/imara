import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [NotesController],
  providers: [NotesService, SessionGuard],
})
export class NotesModule {}
