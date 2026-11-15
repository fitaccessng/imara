import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { DocumentsController, PublicDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController, PublicDocumentsController],
  providers: [DocumentsService, SessionGuard],
})
export class DocumentsModule {}
