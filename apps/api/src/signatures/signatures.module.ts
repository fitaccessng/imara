import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
