import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StoredFileStatus, WorkspaceMemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceSubscriptionService } from '../subscriptions/workspace-subscription.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateMeetingDto, MeetingActionItemDto, UpdateMeetingDto } from './meetings.dto';

const fileSelect = { id: true, originalName: true, mimeType: true, sizeBytes: true } as const;
const meetingInclude = {
  recordingFile: { select: fileSelect },
  actionItems: { orderBy: { createdAt: 'asc' as const } },
  calendarEvent: { select: { id: true, title: true, startsAt: true, endsAt: true } },
} as const;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly subscriptions: WorkspaceSubscriptionService,
  ) {}

  private validateDates(startedAt?: string | null, endedAt?: string | null) {
    const start = startedAt ? new Date(startedAt) : null;
    const end = endedAt ? new Date(endedAt) : null;
    if (start && end && end < start) throw new BadRequestException('Meeting end time must be after its start time');
  }

  private async authorizeWorkspace(workspaceId: string, userId: string, write = false) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (member.status !== WorkspaceMemberStatus.ACTIVE) throw new NotFoundException('Workspace not found');
    if (write) await this.subscriptions.requireWriteAccess(workspaceId);
  }

  private async assertRecordingFile(userId: string, workspaceId: string | null, fileId?: string | null) {
    if (!fileId) return null;
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        ...(workspaceId ? { workspaceId } : { userId, workspaceId: null }),
        status: StoredFileStatus.READY,
        deletedAt: null,
        eventId: null,
        fileRequestId: null,
      },
      select: { id: true },
    });
    if (!file) throw new BadRequestException('Recording must be a ready, nondeleted file in the same scope');
    return fileId;
  }

  private async validateCalendarEvent(
    userId: string,
    workspaceId: string | null,
    eventId?: string | null,
    meetingId?: string,
  ) {
    if (!eventId) return null;
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        ...(workspaceId
          ? {
              workspaceId,
              ...(meetingId
                ? { OR: [{ workspaceMeetingId: null }, { workspaceMeetingId: meetingId }] }
                : { workspaceMeetingId: null }),
            }
          : {
              createdById: userId,
              workspaceId: null,
              ...(meetingId
                ? { OR: [{ personalMeetingId: null }, { personalMeetingId: meetingId }] }
                : { personalMeetingId: null }),
            }),
      },
      select: { id: true },
    });
    if (!event) throw new BadRequestException('Calendar event must be unlinked and belong to the same scope');
    return eventId;
  }

  private async syncCalendarEvent(
    tx: any,
    userId: string,
    workspaceId: string | null,
    meetingId: string,
    currentEventId: string | null,
    nextEventId: string | null,
  ) {
    if (currentEventId === nextEventId) return;
    const meetingField = workspaceId ? 'workspaceMeetingId' : 'personalMeetingId';
    const scope = workspaceId ? { workspaceId } : { createdById: userId, workspaceId: null };
    if (nextEventId) {
      const claimed = await tx.calendarEvent.updateMany({
        where: { id: nextEventId, ...scope, [meetingField]: null },
        data: { [meetingField]: meetingId },
      });
      if (!claimed.count) {
        throw new BadRequestException('Calendar event must be unlinked and belong to the same scope');
      }
    }
    if (currentEventId) {
      const released = await tx.calendarEvent.updateMany({
        where: { id: currentEventId, ...scope, [meetingField]: meetingId },
        data: { [meetingField]: null },
      });
      if (!released.count) throw new NotFoundException('Meeting calendar link not found');
    }
  }

  private async validateActionItems(
    userId: string,
    workspaceId: string | null,
    items: MeetingActionItemDto[] = [],
  ) {
    if (!workspaceId && items.some((item) => item.assigneeUserId && item.assigneeUserId !== userId)) {
      throw new BadRequestException('Personal action items can only be assigned to the owner');
    }
    if (workspaceId) {
      const assigneeIds = [...new Set(items.map((item) => item.assigneeUserId).filter((id): id is string => Boolean(id)))];
      if (assigneeIds.length) {
        const members = await this.prisma.workspaceMember.findMany({
          where: { workspaceId, userId: { in: assigneeIds }, status: WorkspaceMemberStatus.ACTIVE },
          select: { userId: true },
        });
        if (members.length !== assigneeIds.length) {
          throw new BadRequestException('Action item assignees must be active workspace members');
        }
      }
    }
    return items.map((item) => ({
      title: item.title.trim(),
      description: item.description?.trim() || null,
      dueAt: item.dueAt ? new Date(item.dueAt) : null,
      assigneeUserId: item.assigneeUserId || null,
    }));
  }

  private present<T extends {
    recordingFile: { sizeBytes: bigint } | null;
    calendarEvent?: { id: string } | null;
  }>(meeting: T) {
    return {
      ...meeting,
      calendarEventId: meeting.calendarEvent?.id ?? null,
      recordingFile: meeting.recordingFile
        ? { ...meeting.recordingFile, sizeBytes: meeting.recordingFile.sizeBytes.toString() }
        : null,
    };
  }

  async listPersonal(userId: string) {
    const meetings = await this.prisma.personalMeeting.findMany({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      include: meetingInclude,
    });
    return meetings.map((meeting) => this.present(meeting));
  }

  async getPersonal(userId: string, id: string) {
    const meeting = await this.prisma.personalMeeting.findFirst({
      where: { id, userId }, include: meetingInclude,
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.present(meeting);
  }

  async createPersonal(userId: string, dto: CreateMeetingDto) {
    this.validateDates(dto.startedAt, dto.endedAt);
    const [recordingFileId, actionItems, calendarEventId] = await Promise.all([
      this.assertRecordingFile(userId, null, dto.recordingFileId),
      this.validateActionItems(userId, null, dto.actionItems),
      this.validateCalendarEvent(userId, null, dto.calendarEventId),
    ]);
    const data = {
      userId, title: dto.title.trim(), startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null, transcript: dto.transcript,
      summary: dto.summary?.trim() || null, decisions: dto.decisions ?? [], recordingFileId,
      actionItems: { create: actionItems },
    };
    if (!calendarEventId) {
      return this.prisma.personalMeeting.create({ data, include: meetingInclude })
        .then((meeting) => this.present(meeting));
    }
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.personalMeeting.create({ data, include: meetingInclude });
      await this.syncCalendarEvent(tx, userId, null, meeting.id, null, calendarEventId);
      return this.present(await tx.personalMeeting.findFirstOrThrow({ where: { id: meeting.id, userId }, include: meetingInclude }));
    });
  }

  async updatePersonal(userId: string, id: string, dto: UpdateMeetingDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('At least one meeting field must be provided');
    const current = await this.prisma.personalMeeting.findFirst({
      where: { id, userId }, include: { calendarEvent: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('Meeting not found');
    const start = dto.startedAt === undefined ? current.startedAt : dto.startedAt ? new Date(dto.startedAt) : null;
    const end = dto.endedAt === undefined ? current.endedAt : dto.endedAt ? new Date(dto.endedAt) : null;
    this.validateDates(start?.toISOString(), end?.toISOString());
    const recordingFileId = dto.recordingFileId === undefined
      ? current.recordingFileId
      : await this.assertRecordingFile(userId, null, dto.recordingFileId);
    const calendarEventId = dto.calendarEventId === undefined
      ? undefined
      : await this.validateCalendarEvent(userId, null, dto.calendarEventId, id);
    const data: any = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.startedAt !== undefined ? { startedAt: start } : {}),
      ...(dto.endedAt !== undefined ? { endedAt: end } : {}),
      ...(dto.transcript !== undefined ? { transcript: dto.transcript } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary?.trim() || null } : {}),
      ...(dto.decisions !== undefined ? { decisions: dto.decisions } : {}),
      ...(dto.recordingFileId !== undefined ? { recordingFileId } : {}),
    };
    if (dto.actionItems !== undefined || calendarEventId !== undefined) {
      const actionItems = await this.validateActionItems(userId, null, dto.actionItems);
      return this.prisma.$transaction(async (tx) => {
        if (dto.actionItems !== undefined) {
          const linked = await tx.meetingActionItem.count({
            where: { personalMeetingId: id, personalTaskId: { not: null } },
          });
          if (linked) throw new BadRequestException('Action items linked to tasks cannot be replaced');
          await tx.meetingActionItem.deleteMany({ where: { personalMeetingId: id } });
          await tx.meetingActionItem.createMany({
            data: actionItems.map((item) => ({ ...item, personalMeetingId: id })),
          });
        }
        if (calendarEventId !== undefined) {
          await this.syncCalendarEvent(tx, userId, null, id, current.calendarEvent?.id ?? null, calendarEventId);
        }
        if (Object.keys(data).length) {
          await tx.personalMeeting.updateMany({ where: { id, userId }, data });
        }
        return this.present(await tx.personalMeeting.findFirstOrThrow({ where: { id, userId }, include: meetingInclude }));
      });
    }
    const updated = await this.prisma.personalMeeting.updateMany({ where: { id, userId }, data });
    if (!updated.count) throw new NotFoundException('Meeting not found');
    return this.present(await this.prisma.personalMeeting.findFirstOrThrow({ where: { id, userId }, include: meetingInclude }));
  }

  async deletePersonal(userId: string, id: string) {
    const current = await this.prisma.personalMeeting.findFirst({
      where: { id, userId }, include: { calendarEvent: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('Meeting not found');
    await this.prisma.$transaction(async (tx) => {
      if (current.calendarEvent) {
        await this.syncCalendarEvent(tx, userId, null, id, current.calendarEvent.id, null);
      }
      const result = await tx.personalMeeting.deleteMany({ where: { id, userId } });
      if (!result.count) throw new NotFoundException('Meeting not found');
    });
  }

  async listWorkspace(workspaceId: string, userId: string) {
    await this.authorizeWorkspace(workspaceId, userId);
    const meetings = await this.prisma.workspaceMeeting.findMany({
      where: { workspaceId },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      include: meetingInclude,
    });
    return meetings.map((meeting) => this.present(meeting));
  }

  async getWorkspace(workspaceId: string, userId: string, id: string) {
    await this.authorizeWorkspace(workspaceId, userId);
    const meeting = await this.prisma.workspaceMeeting.findFirst({
      where: { id, workspaceId }, include: meetingInclude,
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.present(meeting);
  }

  async createWorkspace(workspaceId: string, userId: string, dto: CreateMeetingDto) {
    await this.authorizeWorkspace(workspaceId, userId, true);
    this.validateDates(dto.startedAt, dto.endedAt);
    const [recordingFileId, actionItems, calendarEventId] = await Promise.all([
      this.assertRecordingFile(userId, workspaceId, dto.recordingFileId),
      this.validateActionItems(userId, workspaceId, dto.actionItems),
      this.validateCalendarEvent(userId, workspaceId, dto.calendarEventId),
    ]);
    const data = {
      workspaceId, createdById: userId, title: dto.title.trim(),
      startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      transcript: dto.transcript, summary: dto.summary?.trim() || null,
      decisions: dto.decisions ?? [], recordingFileId, actionItems: { create: actionItems },
    };
    if (!calendarEventId) {
      return this.prisma.workspaceMeeting.create({ data, include: meetingInclude })
        .then((meeting) => this.present(meeting));
    }
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.workspaceMeeting.create({ data, include: meetingInclude });
      await this.syncCalendarEvent(tx, userId, workspaceId, meeting.id, null, calendarEventId);
      return this.present(await tx.workspaceMeeting.findFirstOrThrow({
        where: { id: meeting.id, workspaceId }, include: meetingInclude,
      }));
    });
  }

  async updateWorkspace(workspaceId: string, userId: string, id: string, dto: UpdateMeetingDto) {
    await this.authorizeWorkspace(workspaceId, userId, true);
    if (!Object.keys(dto).length) throw new BadRequestException('At least one meeting field must be provided');
    const current = await this.prisma.workspaceMeeting.findFirst({
      where: { id, workspaceId }, include: { calendarEvent: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('Meeting not found');
    const start = dto.startedAt === undefined ? current.startedAt : dto.startedAt ? new Date(dto.startedAt) : null;
    const end = dto.endedAt === undefined ? current.endedAt : dto.endedAt ? new Date(dto.endedAt) : null;
    this.validateDates(start?.toISOString(), end?.toISOString());
    const recordingFileId = dto.recordingFileId === undefined
      ? current.recordingFileId
      : await this.assertRecordingFile(userId, workspaceId, dto.recordingFileId);
    const calendarEventId = dto.calendarEventId === undefined
      ? undefined
      : await this.validateCalendarEvent(userId, workspaceId, dto.calendarEventId, id);
    const data: any = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.startedAt !== undefined ? { startedAt: start } : {}),
      ...(dto.endedAt !== undefined ? { endedAt: end } : {}),
      ...(dto.transcript !== undefined ? { transcript: dto.transcript } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary?.trim() || null } : {}),
      ...(dto.decisions !== undefined ? { decisions: dto.decisions } : {}),
      ...(dto.recordingFileId !== undefined ? { recordingFileId } : {}),
    };
    if (dto.actionItems !== undefined || calendarEventId !== undefined) {
      const actionItems = await this.validateActionItems(userId, workspaceId, dto.actionItems);
      return this.prisma.$transaction(async (tx) => {
        if (dto.actionItems !== undefined) {
          const linked = await tx.meetingActionItem.count({
            where: { workspaceMeetingId: id, workspaceTaskId: { not: null } },
          });
          if (linked) throw new BadRequestException('Action items linked to tasks cannot be replaced');
          await tx.meetingActionItem.deleteMany({ where: { workspaceMeetingId: id } });
          await tx.meetingActionItem.createMany({
            data: actionItems.map((item) => ({ ...item, workspaceMeetingId: id })),
          });
        }
        if (calendarEventId !== undefined) {
          await this.syncCalendarEvent(tx, userId, workspaceId, id, current.calendarEvent?.id ?? null, calendarEventId);
        }
        if (Object.keys(data).length) {
          await tx.workspaceMeeting.updateMany({ where: { id, workspaceId }, data });
        }
        return this.present(await tx.workspaceMeeting.findFirstOrThrow({ where: { id, workspaceId }, include: meetingInclude }));
      });
    }
    const updated = await this.prisma.workspaceMeeting.updateMany({ where: { id, workspaceId }, data });
    if (!updated.count) throw new NotFoundException('Meeting not found');
    return this.present(await this.prisma.workspaceMeeting.findFirstOrThrow({ where: { id, workspaceId }, include: meetingInclude }));
  }

  async deleteWorkspace(workspaceId: string, userId: string, id: string) {
    await this.authorizeWorkspace(workspaceId, userId, true);
    const current = await this.prisma.workspaceMeeting.findFirst({
      where: { id, workspaceId }, include: { calendarEvent: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('Meeting not found');
    await this.prisma.$transaction(async (tx) => {
      if (current.calendarEvent) {
        await this.syncCalendarEvent(tx, userId, workspaceId, id, current.calendarEvent.id, null);
      }
      const result = await tx.workspaceMeeting.deleteMany({ where: { id, workspaceId } });
      if (!result.count) throw new NotFoundException('Meeting not found');
    });
  }

  async createActionTask(userId: string, id: string, actionItemId: string) {
    const meeting = await this.prisma.personalMeeting.findFirst({ where: { id, userId }, select: { id: true, userId: true } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.meetingActionItem.findFirst({ where: { id: actionItemId, personalMeetingId: id } });
      if (!item) throw new NotFoundException('Action item not found');
      if (item.personalTaskId) return tx.personalTask.findUniqueOrThrow({ where: { id: item.personalTaskId } });
      const task = await tx.personalTask.create({
        data: {
          userId, creatorId: userId, title: item.title, description: item.description,
          dueAt: item.dueAt, assigneeUserId: userId,
        },
      });
      const linked = await tx.meetingActionItem.updateMany({
        where: { id: item.id, personalTaskId: null }, data: { personalTaskId: task.id },
      });
      if (!linked.count) {
        await tx.personalTask.delete({ where: { id: task.id } });
        const latest = await tx.meetingActionItem.findFirstOrThrow({
          where: { id: item.id, personalMeetingId: id },
        });
        if (!latest.personalTaskId) throw new NotFoundException('Action item task could not be created');
        return tx.personalTask.findUniqueOrThrow({ where: { id: latest.personalTaskId } });
      }
      return task;
    });
  }

  async createWorkspaceActionTask(workspaceId: string, userId: string, id: string, actionItemId: string) {
    await this.authorizeWorkspace(workspaceId, userId, true);
    const meeting = await this.prisma.workspaceMeeting.findFirst({
      where: { id, workspaceId }, select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.meetingActionItem.findFirst({ where: { id: actionItemId, workspaceMeetingId: id } });
      if (!item) throw new NotFoundException('Action item not found');
      if (item.workspaceTaskId) return tx.workspaceTask.findFirstOrThrow({
        where: { id: item.workspaceTaskId, workspaceId },
      });
      const task = await tx.workspaceTask.create({
        data: {
          workspaceId, creatorId: userId, title: item.title, description: item.description,
          dueAt: item.dueAt, assigneeUserId: item.assigneeUserId,
        },
      });
      const linked = await tx.meetingActionItem.updateMany({
        where: { id: item.id, workspaceTaskId: null }, data: { workspaceTaskId: task.id },
      });
      if (!linked.count) {
        await tx.workspaceTask.deleteMany({ where: { id: task.id, workspaceId } });
        const latest = await tx.meetingActionItem.findFirstOrThrow({
          where: { id: item.id, workspaceMeetingId: id },
        });
        if (!latest.workspaceTaskId) throw new NotFoundException('Action item task could not be created');
        return tx.workspaceTask.findFirstOrThrow({ where: { id: latest.workspaceTaskId, workspaceId } });
      }
      return task;
    });
  }
}
