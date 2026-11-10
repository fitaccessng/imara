jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: HttpException,
    ForbiddenException: HttpException,
    NotFoundException: HttpException,
    ServiceUnavailableException: HttpException,
  };
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { FileDeliveryService } from './file-delivery.service';

describe('FileDeliveryService', () => {
  const authorizeWorkspace = jest.fn();
  const authorizeFolder = jest.fn();
  const findFile = jest.fn();
  const findMembers = jest.fn();
  const createDelivery = jest.fn();
  const findDeliveries = jest.fn();
  const findDelivery = jest.fn();
  const auditCreate = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    fileDelivery: { create: createDelivery },
  }));
  const getObject = jest.fn();
  const sendFileAttachment = jest.fn();
  const file = {
    id: 'file-1', objectKey: 'key-1', originalName: 'report.pdf', mimeType: 'application/pdf',
    sizeBytes: 16n, folderId: 'folder-1',
  };
  const service = new FileDeliveryService(
    {
      storedFile: { findFirst: findFile },
      workspaceMember: { findMany: findMembers },
      fileDelivery: { findMany: findDeliveries, findFirst: findDelivery },
      auditLog: { create: auditCreate },
      $transaction: transaction,
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme Business' }) },
    } as never,
    { get: getObject } as never,
    { authorizeWorkspace, authorizeFolder } as never,
    { sendFileAttachment } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authorizeWorkspace.mockResolvedValue({ status: 'ACTIVE', role: 'STAFF' });
    authorizeFolder.mockResolvedValue({});
    findFile.mockResolvedValue(file);
    findMembers.mockResolvedValue([{ userId: 'recipient-1' }]);
    createDelivery.mockResolvedValue({ id: 'delivery-1', recipientId: 'recipient-1' });
    getObject.mockResolvedValue({ body: Readable.from(Buffer.from('file')) });
    sendFileAttachment.mockResolvedValue(undefined);
  });

  it('requires at least one recipient and enforces shareFiles folder permission', async () => {
    await expect(service.send('workspace-1', 'sender-1', 'file-1', {}))
      .rejects.toBeInstanceOf(BadRequestException);
    authorizeFolder.mockRejectedValue(new ForbiddenException());
    await expect(service.send('workspace-1', 'sender-1', 'file-1', { recipientUserIds: ['recipient-1'] }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-1', 'sender-1', 'folder-1', 'shareFiles');
  });

  it('creates private workspace deliveries and sends the requested attachment', async () => {
    const result = await service.send('workspace-1', 'sender-1', 'file-1', {
      recipientUserIds: ['recipient-1'], emailRecipients: ['person@example.com'], message: 'Please review',
    });
    expect(result).toEqual({ deliveries: [{ id: 'delivery-1', recipientId: 'recipient-1' }], emailed: true });
    expect(createDelivery).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senderId: 'sender-1', recipientId: 'recipient-1', fileId: 'file-1' }),
    }));
    expect(sendFileAttachment).toHaveBeenCalledWith(
      ['person@example.com'], 'Acme Business', 'report.pdf', 'application/pdf', expect.any(Readable), 'Please review',
    );
  });

  it('surfaces SMTP failures instead of reporting emailed success', async () => {
    sendFileAttachment.mockRejectedValue(new Error('smtp failed'));
    await expect(service.send('workspace-1', 'sender-1', 'file-1', { emailRecipients: ['person@example.com'] }))
      .rejects.toThrow('smtp failed');
  });

  it('lists only current-user inbox/outbox rows in the inbox UI response shape', async () => {
    const createdAt = new Date('2026-11-10T12:00:00Z');
    findDeliveries.mockResolvedValue([{
      id: 'delivery-1',
      createdAt,
      sender: { id: 'sender-1', name: 'Sender' },
      recipient: { id: 'recipient-1', name: 'Recipient', email: 'recipient@example.com' },
      file: { id: 'file-1', originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 16n },
    }]);

    await expect(service.list('workspace-1', 'current-user')).resolves.toEqual([{
      id: 'delivery-1',
      createdAt,
      sender: { id: 'sender-1', name: 'Sender' },
      recipient: { id: 'recipient-1', name: 'Recipient', email: 'recipient@example.com' },
      file: { id: 'file-1', name: 'report.pdf', mimeType: 'application/pdf', sizeBytes: '16' },
    }]);
    expect(findDeliveries).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace-1', OR: [{ senderId: 'current-user' }, { recipientId: 'current-user' }] },
    }));
  });

  it('allows delivery downloads only when the current user is sender or recipient', async () => {
    findDelivery.mockResolvedValue({
      id: 'delivery-1',
      file: { id: 'file-1', objectKey: 'key-1', originalName: 'report.pdf', mimeType: 'application/pdf', status: 'READY' },
    });
    await expect(service.download('workspace-1', 'recipient-1', 'delivery-1'))
      .resolves.toMatchObject({ name: 'report.pdf', contentType: 'application/pdf' });
    expect(findDelivery).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'delivery-1', workspaceId: 'workspace-1',
        OR: [{ senderId: 'recipient-1' }, { recipientId: 'recipient-1' }],
      },
    }));

    findDelivery.mockResolvedValue(null);
    await expect(service.download('workspace-1', 'outsider-1', 'delivery-1')).rejects.toThrow();
  });
});
