import {
  Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
@UseGuards(SessionGuard)
export class PersonalNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.prisma.notification.findMany({
      where: { userId: req.auth.userId, workspaceId: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: req.auth.userId, workspaceId: null, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId: req.auth.userId, workspaceId: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { id: notificationId, read: true };
  }
}
