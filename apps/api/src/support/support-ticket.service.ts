import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformAdminStatus,
  Prisma,
  SupportTicketStatus,
  UserRole,
} from '@prisma/client';
import type { PlatformAdminRequest } from '../admin/platform-admin.types';
import type {
  AdminSupportTicketUpdateDto,
  AdminSupportTicketsQueryDto,
  SupportTicketCreateDto,
  SupportTicketMessageDto,
  SupportTicketReplyDto,
} from '../admin/admin.dto';
import { PrismaService } from '../prisma/prisma.service';

function safeRequestValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

@Injectable()
export class SupportTicketService {
  constructor(private readonly prisma: PrismaService) {}

  async adminAgents(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.support-agents.read', 'platform-admin', {
      status: 'ACTIVE',
    });
    const profiles = await this.prisma.platformAdminProfile.findMany({
      where: { status: PlatformAdminStatus.ACTIVE },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return profiles.map(({ user }) => user);
  }

  async create(userId: string, input: SupportTicketCreateDto) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          userId,
          subject: input.subject,
          category: input.category,
          messages: {
            create: { authorId: userId, body: input.body },
          },
        },
        select: {
          id: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return ticket;
    });
  }

  async listForUser(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: { where: { internalNote: false } } } },
      },
    });
    return tickets.map(({ _count, ...ticket }) => ({
      ...ticket,
      messageCount: _count.messages,
    }));
  }

  async userDetails(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { internalNote: false },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async addUserMessage(ticketId: string, userId: string, input: SupportTicketReplyDto) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticketId, userId },
        select: { id: true, status: true },
      });
      if (!ticket) throw new NotFoundException('Support ticket not found');
      if (ticket.status === SupportTicketStatus.RESOLVED) {
        throw new ConflictException('This ticket is resolved. Create a new ticket to continue.');
      }
      const message = await tx.supportTicketMessage.create({
        data: { ticketId, authorId: userId, body: input.body },
        select: { id: true, body: true, createdAt: true },
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: SupportTicketStatus.OPEN },
      });
      return message;
    });
  }

  async adminList(query: AdminSupportTicketsQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.support-ticket.list.read', 'support-ticket', {
      page: query.page,
      pageSize: query.pageSize,
      statusFiltered: Boolean(query.status),
      priorityFiltered: Boolean(query.priority),
      searchApplied: Boolean(query.q),
    });
    const conditions: Prisma.SupportTicketWhereInput[] = [];
    if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.q) {
      conditions.push({
        OR: [
          { subject: { contains: query.q, mode: 'insensitive' } },
          { customer: { email: { contains: query.q, mode: 'insensitive' } } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.SupportTicketWhereInput = conditions.length ? { AND: conditions } : {};
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, tickets] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        select: {
          id: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
          assignedAdmin: { select: { id: true, name: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),
    ]);
    return {
      items: tickets.map(({ _count, ...ticket }) => ({
        ...ticket,
        messageCount: _count.messages,
      })),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async adminDetails(ticketId: string, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.support-ticket.detail.read', 'support-ticket', {
      detail: 'conversation',
    }, ticketId);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            body: true,
            internalNote: true,
            createdAt: true,
            author: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async update(ticketId: string, input: AdminSupportTicketUpdateDto, request: PlatformAdminRequest) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          status: true,
          priority: true,
          assignedAdminId: true,
        },
      });
      if (!current) throw new NotFoundException('Support ticket not found');
      if (input.assignedAdminId) {
        const assignee = await tx.user.findFirst({
          where: {
            id: input.assignedAdminId,
            role: UserRole.ADMIN,
            platformAdminProfile: { is: { status: PlatformAdminStatus.ACTIVE } },
          },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Active platform administrator not found');
      }
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: input.status,
          priority: input.priority,
          ...(input.assignedAdminId !== undefined ? { assignedAdminId: input.assignedAdminId } : {}),
        },
        select: {
          id: true,
          status: true,
          priority: true,
          assignedAdminId: true,
          updatedAt: true,
        },
      });
      await this.auditMutation(
        tx,
        request,
        'admin.support-ticket.update',
        ticketId,
        {
          before: {
            status: current.status,
            priority: current.priority,
            assignedAdminId: current.assignedAdminId ?? '',
          },
          after: {
            status: updated.status,
            priority: updated.priority,
            assignedAdminId: updated.assignedAdminId ?? '',
          },
        },
      );
      return updated;
    });
  }

  async addAdminMessage(
    ticketId: string,
    input: SupportTicketMessageDto,
    request: PlatformAdminRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id: ticketId },
        select: { id: true, status: true },
      });
      if (!ticket) throw new NotFoundException('Support ticket not found');
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId,
          authorId: request.platformAdmin.id,
          body: input.body,
          internalNote: input.internalNote,
        },
        select: { id: true, createdAt: true, internalNote: true },
      });
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: input.internalNote ? ticket.status : SupportTicketStatus.PENDING },
        select: { status: true },
      });
      await this.auditMutation(
        tx,
        request,
        input.internalNote ? 'admin.support-ticket.note' : 'admin.support-ticket.reply',
        ticketId,
        { messageId: message.id, internalNote: input.internalNote, status: updated.status },
      );
      return message;
    });
  }

  private async auditRead(
    request: PlatformAdminRequest,
    action: string,
    resourceType: string,
    metadata: Prisma.InputJsonObject,
    resourceId?: string,
  ): Promise<void> {
    if (!request.platformAdmin.id) throw new InternalServerErrorException('Admin audit context unavailable');
    await this.prisma.platformAdminAuditLog.create({
      data: {
        actorId: request.platformAdmin.id,
        action,
        resourceType,
        resourceId,
        metadata,
        ipAddress: safeRequestValue(request.ip, 64),
        userAgent: safeRequestValue(request.get('user-agent'), 512),
      },
      select: { id: true },
    });
  }

  private async auditMutation(
    tx: Prisma.TransactionClient,
    request: PlatformAdminRequest,
    action: string,
    ticketId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    if (!request.platformAdmin.id) throw new InternalServerErrorException('Admin audit context unavailable');
    await tx.platformAdminAuditLog.create({
      data: {
        actorId: request.platformAdmin.id,
        action,
        resourceType: 'support-ticket',
        resourceId: ticketId,
        metadata,
        ipAddress: safeRequestValue(request.ip, 64),
        userAgent: safeRequestValue(request.get('user-agent'), 512),
      },
      select: { id: true },
    });
  }
}
