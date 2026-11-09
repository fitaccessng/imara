import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionGuard } from '../auth/session.guard';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, SessionGuard],
})
export class ApprovalsModule {}
