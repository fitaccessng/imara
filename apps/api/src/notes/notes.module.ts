import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService, SessionGuard],
})
export class NotesModule {}
