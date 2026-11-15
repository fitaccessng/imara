import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarReminderChannelStatus,
  CalendarReminderDispatchKind,
  CalendarReminderStatus,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@prisma/client';
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

  private async cancelPendingDispatches(
    tx: any,
    eventId: string,
    kinds: CalendarReminderDispatchKind[],
  ): Promise<void> {
    const dispatches = await tx.calendarReminderDispatch.findMany({
      where: {
        eventId,
        kind: { in: kinds },
        status: { in: [CalendarReminderStatus.PENDING, CalendarReminderStatus.SENDING, CalendarReminderStatus.FAILED] },
      },
      select: { id: true },
    });
    if (!dispatches.length) return;
    const ids = dispatches.map((dispatch: { id: string }) => dispatch.id);
    await tx.calendarReminderRecipient.updateMany({
      where: {
        dispatchId: { in: ids },
        inAppStatus: { in: [CalendarReminderChannelStatus.PENDING, CalendarReminderChannelStatus.SENDING, CalendarReminderChannelStatus.FAILED] },
      },
      data: { inAppStatus: CalendarReminderChannelStatus.CANCELLED },
    });
    await tx.calendarReminderRecipient.updateMany({
      where: {
        dispatchId: { in: ids },
        emailStatus: { in: [CalendarReminderChannelStatus.PENDING, CalendarReminderChannelStatus.SENDING, CalendarReminderChannelStatus.FAILED] },
      },
      data: { emailStatus: CalendarReminderChannelStatus.CANCELLED },
    });
    await tx.calendarReminderDispatch.updateMany({
      where: {
        id: { in: ids },
        status: { in: [CalendarReminderStatus.PENDING, CalendarReminderStatus.SENDING, CalendarReminderStatus.FAILED] },
      },
      data: { status: CalendarReminderStatus.CANCELLED },
    });
  }

  private async createEventNotificationDispatch(
    tx: any,
    event: { id: string; workspaceId: string | null },
    revision: number,
    kind: 'EVENT_CREATED' | 'EVENT_UPDATED',
    recipientIds: string[],
  ): Promise<void> {
    if (!recipientIds.length) return;
    await tx.calendarReminderDispatch.create({
      data: {
        eventId: event.id,
        revision,
        kind,
        scheduledFor: new Date(),
        recipients: { createMany: { data: recipientIds.map((userId) => ({ userId })) } },
      },
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
      await this.cancelPendingDispatches(tx, event.id, [CalendarReminderDispatchKind.REMINDER]);
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
    const recipientIds = taggedUserIds.filter((taggedUserId) => taggedUserId !== userId);
    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          workspaceId, createdById: userId, title: dto.title.trim(), description: dto.description?.trim() || null,
          startsAt: start, endsAt: end, allDay: dto.allDay,
          reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
          reminderAt: this.getReminderAt(start, dto.reminderMinutesBefore),
          notificationRevision: recipientIds.length ? 1 : 0,
          ...(taggedUserIds.length ? { taggedUsers: { createMany: { data: taggedUserIds.map((taggedUserId) => ({ userId: taggedUserId })) } } } : {}),
        },
        include: taggedUsersInclude(workspaceId),
      });
      await this.createEventNotificationDispatch(
        tx,
        created,
        created.notificationRevision,
        CalendarReminderDispatchKind.EVENT_CREATED,
        recipientIds,
      );
      return created;
    });
    return this.presentEvent(event);
  }

  private async editableWorkspaceEvent(workspaceId: string, userId: string, eventId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
      include: { taggedUsers: { select: { userId: true } } },
    });
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
    const currentTaggedUserIds = event.taggedUsers.map((tag: { userId: string }) => tag.userId);
    const finalTaggedUserIds = taggedUserIds ?? currentTaggedUserIds;
    const currentTagSet = new Set(currentTaggedUserIds);
    const finalTagSet = new Set(finalTaggedUserIds);
    const tagsChanged = currentTagSet.size !== finalTagSet.size ||
      [...currentTagSet].some((taggedUserId) => !finalTagSet.has(taggedUserId));
    const nextTitle = dto.title === undefined ? event.title : dto.title.trim();
    const nextDescription = dto.description === undefined ? event.description : dto.description.trim() || null;
    const titleChanged = nextTitle !== event.title;
    const descriptionChanged = nextDescription !== event.description;
    const startsChanged = start.getTime() !== event.startsAt.getTime();
    const endsChanged = end.getTime() !== event.endsAt.getTime();
    const allDayChanged = dto.allDay !== undefined && dto.allDay !== event.allDay;
    const detailsChanged = titleChanged || descriptionChanged || startsChanged || endsChanged || allDayChanged;
    const minutesBefore = dto.reminderMinutesBefore === undefined
      ? event.reminderMinutesBefore
      : dto.reminderMinutesBefore;
    const reminderChanged = minutesBefore !== event.reminderMinutesBefore;
    const scheduleChanged = startsChanged || reminderChanged || tagsChanged;
    const notificationRecipients = detailsChanged
      ? finalTaggedUserIds.filter((taggedUserId) => taggedUserId !== event.createdById)
      : finalTaggedUserIds.filter((taggedUserId) => !currentTagSet.has(taggedUserId) && taggedUserId !== event.createdById);
    const shouldNotify = detailsChanged || tagsChanged;
    const incrementNotificationRevision = shouldNotify && notificationRecipients.length > 0;
    if (!detailsChanged && !tagsChanged && !scheduleChanged) {
      const unchanged = await this.prisma.calendarEvent.findFirst({
        where: { id: event.id, workspaceId },
        include: taggedUsersInclude(workspaceId),
      });
      if (!unchanged) throw new NotFoundException('Calendar event not found');
      return this.presentEvent(unchanged);
    }

    const data = {
      ...(titleChanged ? { title: nextTitle } : {}),
      ...(descriptionChanged ? { description: nextDescription } : {}),
      ...(startsChanged ? { startsAt: start } : {}),
      ...(endsChanged ? { endsAt: end } : {}),
      ...(allDayChanged ? { allDay: dto.allDay } : {}),
      ...(scheduleChanged ? {
        reminderMinutesBefore: minutesBefore,
        reminderAt: this.getReminderAt(start, minutesBefore),
        reminderRevision: { increment: 1 },
        reminderStatus: CalendarReminderStatus.PENDING,
      } : {}),
      ...(incrementNotificationRevision ? { notificationRevision: { increment: 1 } } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      if (scheduleChanged) {
        await this.cancelPendingDispatches(tx, event.id, [CalendarReminderDispatchKind.REMINDER]);
      }
      if (detailsChanged) {
        await this.cancelPendingDispatches(tx, event.id, [
          CalendarReminderDispatchKind.EVENT_CREATED,
          CalendarReminderDispatchKind.EVENT_UPDATED,
        ]);
      }
      if (tagsChanged && taggedUserIds !== undefined) {
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
      if (shouldNotify && notificationRecipients.length) {
        await this.createEventNotificationDispatch(
          tx,
          updated,
          updated.notificationRevision,
          CalendarReminderDispatchKind.EVENT_UPDATED,
          notificationRecipients,
        );
      }
      return this.presentEvent(updated);
    });
  }

  async deleteWorkspace(workspaceId: string, userId: string, eventId: string) {
    const event = await this.editableWorkspaceEvent(workspaceId, userId, eventId);
    await this.prisma.calendarEvent.delete({ where: { id: event.id } });
  }
}
