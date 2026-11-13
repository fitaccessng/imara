import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarReminderChannelStatus, CalendarReminderStatus, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';
import { CALENDAR_REMINDER_OPTIONS, CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

function taggedUsersInclude(workspaceId?: string) {
  return {
    taggedUsers: {
      ...(workspaceId ? {
        where: {
          user: {
            memberships: {
              some: { workspaceId, status: WorkspaceMemberStatus.ACTIVE },
            },
          },
        },
      } : {}),
      select: { user: { select: { id: true, name: true, email: true } } },
    },
  };
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspacesService) {}

  private dates(startsAt: string | Date, endsAt: string | Date) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new BadRequestException('Event end time must be after its start time');
    }
    return { start, end };
  }

  private getReminderAt(startsAt: Date, minutesBefore: number | null | undefined): Date | null {
    if (minutesBefore == null) return null;
    if (!CALENDAR_REMINDER_OPTIONS.some((option) => option === minutesBefore)) {
      throw new BadRequestException(`Reminder time must be one of: ${CALENDAR_REMINDER_OPTIONS.join(', ')}`);
    }
    return new Date(startsAt.getTime() - minutesBefore * 60_000);
  }

  private presentEvent<T extends {
    taggedUsers?: Array<{ user: { id: string; name: string; email: string } }>;
  }>(event: T) {
    const taggedUsers = (event.taggedUsers ?? []).map(({ user }) => user);
    return {
      ...event,
      taggedUserIds: taggedUsers.map(({ id }) => id),
      taggedUsers,
    };
  }

  private async validateTaggedUsers(workspaceId: string, ids: string[] | undefined): Promise<string[]> {
    const userIds = [...new Set(ids ?? [])];
    if (!userIds.length) return userIds;
    const activeMembers = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: userIds }, status: WorkspaceMemberStatus.ACTIVE },
      select: { userId: true },
    });
    if (activeMembers.length !== userIds.length) {
      throw new BadRequestException('Tagged users must be active members of this workspace');
    }
    return userIds;
  }

  private async cancelPendingDispatches(tx: any, eventId: string): Promise<void> {
    const dispatches = await tx.calendarReminderDispatch.findMany({
      where: { eventId, status: { in: [CalendarReminderStatus.PENDING, CalendarReminderStatus.SENDING, CalendarReminderStatus.FAILED] } },
      select: { id: true },
    });
    if (!dispatches.length) return;
    const ids = dispatches.map((dispatch: { id: string }) => dispatch.id);
    await tx.calendarReminderRecipient.updateMany({
      where: { dispatchId: { in: ids } },
      data: {
        inAppStatus: CalendarReminderChannelStatus.CANCELLED,
        emailStatus: CalendarReminderChannelStatus.CANCELLED,
      },
    });
    await tx.calendarReminderDispatch.updateMany({
      where: { id: { in: ids } },
      data: { status: CalendarReminderStatus.CANCELLED },
    });
  }

  async listPersonal(userId: string) {
    const events = await this.prisma.calendarEvent.findMany({
      where: { createdById: userId, workspaceId: null },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: taggedUsersInclude(),
    });
    return events.map((event) => this.presentEvent(event));
  }

  async createPersonal(userId: string, dto: CreateCalendarEventDto) {
    const { start, end } = this.dates(dto.startsAt, dto.endsAt);
    if (dto.taggedUserIds?.length) {
      throw new BadRequestException('Personal events cannot tag other users');
    }
    const event = await this.prisma.calendarEvent.create({
      data: {
        createdById: userId, title: dto.title.trim(), description: dto.description?.trim() || null,
        startsAt: start, endsAt: end, allDay: dto.allDay,
        reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
        reminderAt: this.getReminderAt(start, dto.reminderMinutesBefore),
      },
      include: taggedUsersInclude(),
    });
    return this.presentEvent(event);
  }

  async updatePersonal(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, createdById: userId, workspaceId: null } });
    if (!event) throw new NotFoundException('Calendar event not found');
    if (!Object.keys(dto).length) throw new BadRequestException('At least one event field must be provided');
    const { start, end } = this.dates(dto.startsAt ?? event.startsAt, dto.endsAt ?? event.endsAt);
    if (dto.taggedUserIds?.length) throw new BadRequestException('Personal events cannot tag other users');
    const scheduleChanged = dto.startsAt !== undefined || dto.reminderMinutesBefore !== undefined;
    const minutesBefore = dto.reminderMinutesBefore === undefined
      ? event.reminderMinutesBefore
      : dto.reminderMinutesBefore;
    const data = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: start } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: end } : {}),
      ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
      ...(scheduleChanged ? {
        reminderMinutesBefore: minutesBefore,
        reminderAt: this.getReminderAt(start, minutesBefore),
        reminderRevision: { increment: 1 },
        reminderStatus: CalendarReminderStatus.PENDING,
      } : {}),
    };
    if (!scheduleChanged) {
      const updated = await this.prisma.calendarEvent.update({
        where: { id: event.id }, data, include: taggedUsersInclude(),
      });
      return this.presentEvent(updated);
    }
    return this.prisma.$transaction(async (tx) => {
      await this.cancelPendingDispatches(tx, event.id);
      const updated = await tx.calendarEvent.update({
        where: { id: event.id }, data, include: taggedUsersInclude(),
      });
      return this.presentEvent(updated);
    });
  }

  async deletePersonal(userId: string, eventId: string) {
    const result = await this.prisma.calendarEvent.deleteMany({
      where: { id: eventId, createdById: userId, workspaceId: null },
    });
    if (!result.count) throw new NotFoundException('Calendar event not found');
  }

  private async activeMember(workspaceId: string, userId: string) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (member.status !== WorkspaceMemberStatus.ACTIVE) throw new NotFoundException('Workspace not found');
    return member;
  }

  async listWorkspace(workspaceId: string, userId: string) {
    await this.activeMember(workspaceId, userId);
    const events = await this.prisma.calendarEvent.findMany({
      where: { workspaceId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: taggedUsersInclude(workspaceId),
    });
    return events.map((event) => this.presentEvent(event));
  }

  async createWorkspace(workspaceId: string, userId: string, dto: CreateCalendarEventDto) {
    await this.activeMember(workspaceId, userId);
    const { start, end } = this.dates(dto.startsAt, dto.endsAt);
    const taggedUserIds = await this.validateTaggedUsers(workspaceId, dto.taggedUserIds);
    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId, createdById: userId, title: dto.title.trim(), description: dto.description?.trim() || null,
        startsAt: start, endsAt: end, allDay: dto.allDay,
        reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
        reminderAt: this.getReminderAt(start, dto.reminderMinutesBefore),
        ...(taggedUserIds.length ? { taggedUsers: { createMany: { data: taggedUserIds.map((taggedUserId) => ({ userId: taggedUserId })) } } } : {}),
      },
      include: taggedUsersInclude(workspaceId),
    });
    return this.presentEvent(event);
  }

  private async editableWorkspaceEvent(workspaceId: string, userId: string, eventId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, workspaceId } });
    if (!event) throw new NotFoundException('Calendar event not found');
    const administrator = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    if (!administrator && event.createdById !== userId) throw new ForbiddenException('You can only manage events you created');
    return event;
  }

  async updateWorkspace(workspaceId: string, userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const event = await this.editableWorkspaceEvent(workspaceId, userId, eventId);
    if (!Object.keys(dto).length) throw new BadRequestException('At least one event field must be provided');
    const { start, end } = this.dates(dto.startsAt ?? event.startsAt, dto.endsAt ?? event.endsAt);
    const taggedUserIds = dto.taggedUserIds === undefined
      ? undefined
      : await this.validateTaggedUsers(workspaceId, dto.taggedUserIds);
    const scheduleChanged = dto.startsAt !== undefined ||
      dto.reminderMinutesBefore !== undefined ||
      dto.taggedUserIds !== undefined;
    const minutesBefore = dto.reminderMinutesBefore === undefined
      ? event.reminderMinutesBefore
      : dto.reminderMinutesBefore;
    const data = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: start } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: end } : {}),
      ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
      ...(scheduleChanged ? {
        reminderMinutesBefore: minutesBefore,
        reminderAt: this.getReminderAt(start, minutesBefore),
        reminderRevision: { increment: 1 },
        reminderStatus: CalendarReminderStatus.PENDING,
      } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      if (scheduleChanged) await this.cancelPendingDispatches(tx, event.id);
      if (taggedUserIds !== undefined) {
        await tx.calendarEventTag.deleteMany({ where: { eventId: event.id } });
        if (taggedUserIds.length) {
          await tx.calendarEventTag.createMany({
            data: taggedUserIds.map((taggedUserId) => ({ eventId: event.id, userId: taggedUserId })),
          });
        }
      }
      const updated = await tx.calendarEvent.update({
        where: { id: event.id }, data, include: taggedUsersInclude(workspaceId),
      });
      return this.presentEvent(updated);
    });
  }

  async deleteWorkspace(workspaceId: string, userId: string, eventId: string) {
    const event = await this.editableWorkspaceEvent(workspaceId, userId, eventId);
    await this.prisma.calendarEvent.delete({ where: { id: event.id } });
  }
}
