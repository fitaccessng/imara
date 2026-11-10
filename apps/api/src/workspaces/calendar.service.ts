import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

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

  async listPersonal(userId: string) {
    return this.prisma.calendarEvent.findMany({
      where: { createdById: userId, workspaceId: null },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createPersonal(userId: string, dto: CreateCalendarEventDto) {
    const { start, end } = this.dates(dto.startsAt, dto.endsAt);
    return this.prisma.calendarEvent.create({
      data: {
        createdById: userId, title: dto.title.trim(), description: dto.description?.trim() || null,
        startsAt: start, endsAt: end, allDay: dto.allDay,
      },
    });
  }

  async updatePersonal(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, createdById: userId, workspaceId: null } });
    if (!event) throw new NotFoundException('Calendar event not found');
    if (!Object.keys(dto).length) throw new BadRequestException('At least one event field must be provided');
    const { start, end } = this.dates(dto.startsAt ?? event.startsAt, dto.endsAt ?? event.endsAt);
    return this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: start } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: end } : {}),
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
      },
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
    return this.prisma.calendarEvent.findMany({
      where: { workspaceId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createWorkspace(workspaceId: string, userId: string, dto: CreateCalendarEventDto) {
    await this.activeMember(workspaceId, userId);
    const { start, end } = this.dates(dto.startsAt, dto.endsAt);
    return this.prisma.calendarEvent.create({
      data: {
        workspaceId, createdById: userId, title: dto.title.trim(), description: dto.description?.trim() || null,
        startsAt: start, endsAt: end, allDay: dto.allDay,
      },
    });
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
    return this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: start } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: end } : {}),
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
      },
    });
  }

  async deleteWorkspace(workspaceId: string, userId: string, eventId: string) {
    const event = await this.editableWorkspaceEvent(workspaceId, userId, eventId);
    await this.prisma.calendarEvent.delete({ where: { id: event.id } });
  }
}
