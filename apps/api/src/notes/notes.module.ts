import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { NotesController, PersonalTasksController } from './notes.controller';
import { NotesService } from './notes.service';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [NotesController, PersonalTasksController],
  providers: [NotesService, SessionGuard],
})
export class NotesModule {}
