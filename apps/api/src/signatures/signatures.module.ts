import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [SignaturesController],
  providers: [SignaturesService, SessionGuard],
})
export class SignaturesModule {}
