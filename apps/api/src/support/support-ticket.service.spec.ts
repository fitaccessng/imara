jest.mock('@nestjs/common', () => ({
  ConflictException: class ConflictException extends Error {},
  Injectable: () => (target: unknown) => target,
  InternalServerErrorException: class InternalServerErrorException extends Error {},
  NotFoundException: class NotFoundException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../prisma/prisma.service';
import type { PlatformAdminRequest } from '../admin/platform-admin.types';
import { SupportTicketService } from './support-ticket.service';

function adminRequest(): PlatformAdminRequest {
  return {
    ip: '192.0.2.7',
    get: jest.fn().mockReturnValue('Test Agent'),
    platformAdmin: { id: 'admin-id' },
  } as unknown as PlatformAdminRequest;
}

describe('SupportTicketService', () => {
  it('only returns the signed-in customer’s public messages', async () => {
    const ticket = {
      id: 'ticket-id',
      status: 'OPEN',
      messages: [{ id: 'reply-id', body: 'We are looking into this', internalNote: false }],
    };
    const findFirst = jest.fn().mockResolvedValue(ticket);
    const service = new SupportTicketService({
      supportTicket: { findFirst },
    } as unknown as PrismaService);

    await expect(service.userDetails('ticket-id', 'customer-id')).resolves.toEqual(ticket);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-id', userId: 'customer-id' },
      select: expect.objectContaining({
        messages: expect.objectContaining({ where: { internalNote: false } }),
      }),
    }));
  });

  it('rejects customer replies on resolved tickets', async () => {
    const tx = {
      supportTicket: { findFirst: jest.fn().mockResolvedValue({ id: 'ticket-id', status: 'RESOLVED' }) },
      supportTicketMessage: { create: jest.fn() },
    };
    const service = new SupportTicketService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);

    await expect(service.addUserMessage('ticket-id', 'customer-id', { body: 'A reply' } as never))
      .rejects.toThrow('This ticket is resolved');
    expect(tx.supportTicketMessage.create).not.toHaveBeenCalled();
  });

  it('writes internal notes and their audit records in the same transaction', async () => {
    const tx = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ticket-id', status: 'OPEN' }),
        update: jest.fn().mockResolvedValue({ status: 'OPEN' }),
      },
      supportTicketMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'note-id',
          createdAt: new Date('2026-11-08T00:00:00Z'),
          internalNote: true,
        }),
      },
      platformAdminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      },
    };
    const service = new SupportTicketService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);

    await expect(service.addAdminMessage('ticket-id', {
      body: 'Internal follow-up',
      internalNote: true,
    }, adminRequest())).resolves.toMatchObject({ id: 'note-id', internalNote: true });
    expect(tx.supportTicketMessage.create).toHaveBeenCalledWith({
      data: {
        ticketId: 'ticket-id',
        authorId: 'admin-id',
        body: 'Internal follow-up',
        internalNote: true,
      },
      select: { id: true, createdAt: true, internalNote: true },
    });
    expect(tx.platformAdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.support-ticket.note',
        resourceType: 'support-ticket',
        resourceId: 'ticket-id',
        metadata: { messageId: 'note-id', internalNote: true, status: 'OPEN' },
      }),
    }));
  });
});
