import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReminderRecurrence, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateReminderDto, UpdateReminderDto } from './reminders.dto';

function nextOccurrence(date: Date, recurrence: ReminderRecurrence, from: Date): Date | null {
  if (recurrence === ReminderRecurrence.ONCE) return null;
  const next = new Date(date);
  if (recurrence === ReminderRecurrence.DAILY) next.setUTCDate(next.getUTCDate() + 1);
  if (recurrence === ReminderRecurrence.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
  if (recurrence === ReminderRecurrence.MONTHLY) {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  while (next <= from) {
    if (recurrence === ReminderRecurrence.DAILY) next.setUTCDate(next.getUTCDate() + 1);
    if (recurrence === ReminderRecurrence.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
    if (recurrence === ReminderRecurrence.MONTHLY) {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
    }
  }
  return next;
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private clean(value: string | undefined): string | undefined {
    const text = value?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    return text || undefined;
  }

  private async activeMember(workspaceId: string, userId: string) {
    return this.workspaces.authorizeWorkspace(workspaceId, userId);
  }

  async list(workspaceId: string, userId: string) {
    await this.activeMember(workspaceId, userId);
    return this.prisma.reminder.findMany({
      where: { workspaceId },
      orderBy: [{ completedAt: 'asc' }, { nextDueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        creator: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateReminderDto) {
    await this.activeMember(workspaceId, userId);
    const title = this.clean(dto.title);
    const dueAt = new Date(dto.dueAt);
    if (!title) throw new BadRequestException('Reminder title is required');
    if (!Number.isFinite(dueAt.getTime())) throw new BadRequestException('Reminder due date is invalid');
    const assignedToId = dto.assignedToUserId ?? userId;
    await this.requireActiveAssignee(workspaceId, assignedToId);
    const recurrence = dto.recurrence as ReminderRecurrence;
    return this.prisma.reminder.create({
      data: {
        workspaceId,
        createdById: userId,
        assignedToId,
        title,
        description: this.clean(dto.description),
        dueAt,
        nextDueAt: dueAt,
        recurrence,
        emailEnabled: dto.emailEnabled ?? false,
      },
      include: {
        creator: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  async update(workspaceId: string, reminderId: string, userId: string, dto: UpdateReminderDto) {
    const member = await this.activeMember(workspaceId, userId);
    const reminder = await this.findReminder(workspaceId, reminderId);
    if (reminder.createdById !== userId && !this.isAdministrator(member.role)) {
      throw new ForbiddenException('Only the reminder creator or a workspace administrator can edit it');
    }
    if (reminder.completedAt || reminder.cancelledAt) {
      throw new BadRequestException('Completed or cancelled reminders cannot be edited');
    }
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    if (dueAt && !Number.isFinite(dueAt.getTime())) throw new BadRequestException('Reminder due date is invalid');
    if (dto.assignedToUserId) await this.requireActiveAssignee(workspaceId, dto.assignedToUserId);
    const title = dto.title === undefined ? undefined : this.clean(dto.title);
    if (dto.title !== undefined && !title) throw new BadRequestException('Reminder title is required');
    const recurrence = dto.recurrence as ReminderRecurrence | undefined;
    const nextDueAt = dueAt ?? (recurrence && recurrence !== reminder.recurrence ? reminder.dueAt : undefined);
    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        ...(title !== undefined && { title }),
        ...(dto.description !== undefined && { description: this.clean(dto.description) ?? null }),
        ...(dueAt && { dueAt }),
        ...(nextDueAt && { nextDueAt }),
        ...(recurrence && { recurrence }),
        ...(dto.assignedToUserId && { assignedToId: dto.assignedToUserId }),
        ...(dto.emailEnabled !== undefined && { emailEnabled: dto.emailEnabled }),
      },
      include: {
        creator: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  async complete(workspaceId: string, reminderId: string, userId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const reminder = await this.findReminder(workspaceId, reminderId);
    if (reminder.assignedToId !== userId && reminder.createdById !== userId && !this.isAdministrator(member.role)) {
      throw new ForbiddenException('Only the assignee, creator, or a workspace administrator can complete it');
    }
    if (reminder.cancelledAt) throw new BadRequestException('Cancelled reminders cannot be completed');
    if (reminder.recurrence === ReminderRecurrence.ONCE) {
      return this.prisma.reminder.update({
        where: { id: reminderId },
        data: { completedAt: reminder.completedAt ?? new Date(), nextDueAt: null },
      });
    }
    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: { lastCompletedAt: new Date() },
    });
  }

  async cancel(workspaceId: string, reminderId: string, userId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const reminder = await this.findReminder(workspaceId, reminderId);
    if (reminder.createdById !== userId && !this.isAdministrator(member.role)) {
      throw new ForbiddenException('Only the reminder creator or a workspace administrator can cancel it');
    }
    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: { cancelledAt: reminder.cancelledAt ?? new Date(), nextDueAt: null },
    });
  }

  private async findReminder(workspaceId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({ where: { id: reminderId, workspaceId } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    return reminder;
  }

  private async requireActiveAssignee(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true },
    });
    if (!member) throw new BadRequestException('Assignee must be an active workspace member');
  }

  private isAdministrator(role: WorkspaceRole): boolean {
    return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
  }
}
