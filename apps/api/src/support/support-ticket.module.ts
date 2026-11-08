import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { SupportTicketController } from './support-ticket.controller';
import { SupportTicketService } from './support-ticket.service';

@Module({
  controllers: [SupportTicketController],
  providers: [SupportTicketService, SessionGuard],
  exports: [SupportTicketService],
})
export class SupportTicketModule {}
