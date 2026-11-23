jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ForbiddenException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException } from '@nestjs/common';
import { WorkspaceFormsService } from './workspace-forms.service';

describe('WorkspaceFormsService', () => {
  const authorizeWorkspace = jest.fn();
  const requireWriteAccess = jest.fn();
  const formFindFirst = jest.fn();
  const formFindMany = jest.fn();
  const formCreate = jest.fn();
  const formUpdateMany = jest.fn();
  const responseCreate = jest.fn();
  const formUploadCreate = jest.fn();
  const formUploadFindFirst = jest.fn();
  const formUploadUpdateMany = jest.fn();
  const storageUpload = jest.fn();
  const storageDelete = jest.fn();
  const tx = {
    workspaceFormResponse: { create: responseCreate },
    workspaceFormUpload: { updateMany: formUploadUpdateMany },
  };
  const prisma = {
    workspaceForm: {
      findFirst: formFindFirst, findMany: formFindMany, create: formCreate, updateMany: formUpdateMany,
    },
    workspaceFormResponse: { create: responseCreate, count: jest.fn(), findMany: jest.fn() },
    workspaceFormUpload: { create: formUploadCreate, findFirst: formUploadFindFirst, updateMany: formUploadUpdateMany },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new WorkspaceFormsService(
    prisma as never,
    { authorizeWorkspace } as never,
    { requireWriteAccess } as never,
    { upload: storageUpload, deleteFile: storageDelete } as never,
  );
  const schema = {
    questions: [
      { id: 'email', prompt: 'Contact email', type: 'EMAIL', required: true },
      { id: 'amount', prompt: 'Quantity', type: 'NUMBER', required: true },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorizeWorkspace.mockResolvedValue({ status: 'ACTIVE', role: 'OWNER' });
    requireWriteAccess.mockResolvedValue(undefined);
  });

  it('only publishes safe form fields and returns a submission receipt without owner data', async () => {
    formFindFirst.mockResolvedValue({
      id: 'form-id', workspaceId: 'workspace-id', title: 'Inquiry', description: null, schema,
    });
    responseCreate.mockResolvedValue({ id: 'response-id', submittedAt: new Date('2026-01-01T00:00:00Z') });

    await expect(service.getPublic('a'.repeat(43))).resolves.toEqual({
      id: 'form-id', title: 'Inquiry', description: null, schema,
    });
    await expect(service.submit('a'.repeat(43), {
      name: ' Ada ', email: 'ADA@example.com', answers: { email: 'USER@example.com', amount: 0 },
    })).resolves.toEqual({ id: 'response-id', submittedAt: new Date('2026-01-01T00:00:00Z') });
    expect(responseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: 'workspace-id', formId: 'form-id', respondentName: 'Ada',
        respondentEmail: 'ada@example.com', answers: { email: 'user@example.com', amount: 0 },
      }),
      select: { id: true, submittedAt: true },
    }));
    expect(JSON.stringify(await service.getPublic('a'.repeat(43)))).not.toContain('ownerUserId');
  });

  it('rejects unknown, invalid and missing required answers before writing a response', async () => {
    formFindFirst.mockResolvedValue({
      id: 'form-id', workspaceId: 'workspace-id', title: 'Inquiry', description: null, schema,
    });
    await expect(service.submit('a'.repeat(43), {
      name: 'Ada', email: 'ada@example.com', answers: { unknown: 'value' },
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submit('a'.repeat(43), {
      name: 'Ada', email: 'ada@example.com', answers: { email: 'not-an-email', amount: 4 },
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submit('a'.repeat(43), {
      name: 'Ada', email: 'ada@example.com', answers: { email: 'ada@example.com' },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(responseCreate).not.toHaveBeenCalled();
  });

  it('stores only a SHA-256 token hash and returns the raw token at share time', async () => {
    const form = {
      id: 'form-id', workspaceId: 'workspace-id', ownerUserId: 'owner-id', schema,
      publishedAt: null, updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    formFindFirst.mockResolvedValue(form);
    formUpdateMany.mockResolvedValue({ count: 1 });
    const result = await service.share('workspace-id', 'owner-id', 'form-id');
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const update = formUpdateMany.mock.calls[0][0];
    expect(update.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(update.data.tokenHash).not.toBe(result.token);
    expect(update.data.revokedAt).toBeNull();
  });

  it('honors write restrictions and rejects malformed form schemas', async () => {
    requireWriteAccess.mockRejectedValue(new Error('read only'));
    await expect(service.create('workspace-id', 'user-id', {
      title: 'Bad', schema: { questions: [] },
    })).rejects.toThrow('read only');
    requireWriteAccess.mockResolvedValue(undefined);
    await expect(service.create('workspace-id', 'user-id', {
      title: 'Bad', schema: { questions: [{ id: 'x', prompt: '', type: 'EMAIL', required: false, extra: true }] },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(formCreate).not.toHaveBeenCalled();
  });

  it('accepts only scoped file answers and creates uploads through workspace quota storage', async () => {
    formFindFirst.mockResolvedValue({
      id: 'form-id', workspaceId: 'workspace-id', title: 'Inquiry', description: null,
      schema: { questions: [{ id: 'attachment', prompt: 'Attach a PDF', type: 'FILE_UPLOAD', required: true }] },
      workspace: { ownerUserId: 'workspace-owner' },
    });
    storageUpload.mockResolvedValue({
      id: 'file-id', originalName: 'evidence.pdf', mimeType: 'application/pdf', sizeBytes: '100',
    });
    formUploadCreate.mockResolvedValue({});
    const pdf = Buffer.from('%PDF-1.7 safe sample');
    await expect(service.uploadPublicFile('a'.repeat(43), 'attachment', {
      buffer: pdf, size: pdf.length, originalname: 'evidence.pdf', mimetype: 'application/pdf',
    })).resolves.toEqual({
      fileId: 'file-id', originalName: 'evidence.pdf', mimeType: 'application/pdf', sizeBytes: '100',
    });
    expect(storageUpload).toHaveBeenCalledWith(
      'workspace-id', 'workspace-owner', expect.objectContaining({ mimetype: 'application/pdf' }), undefined,
    );
    expect(formUploadCreate).toHaveBeenCalledWith({
      data: { workspaceId: 'workspace-id', formId: 'form-id', questionId: 'attachment', fileId: 'file-id' },
    });
  });

  it('only accepts an unconsumed upload staged for the same form question', async () => {
    const fileId = 'c8c0f84a-99ae-4a46-8d81-90a0fc1450af';
    formFindFirst.mockResolvedValue({
      id: 'form-id', workspaceId: 'workspace-id', title: 'Inquiry', description: null,
      schema: { questions: [{ id: 'attachment', prompt: 'Attach', type: 'FILE_UPLOAD', required: true }] },
    });
    formUploadFindFirst.mockResolvedValue({ fileId });
    responseCreate.mockResolvedValue({ id: 'response-id', submittedAt: new Date() });
    formUploadUpdateMany.mockResolvedValue({ count: 1 });
    await expect(service.submit('a'.repeat(43), {
      name: 'Respondent', email: 'r@example.com', answers: { attachment: fileId },
    })).resolves.toMatchObject({ id: 'response-id' });
    expect(formUploadFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'workspace-id', formId: 'form-id', questionId: 'attachment',
        fileId, responseId: null,
      }),
    }));
    expect(formUploadUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace-id', formId: 'form-id', fileId: { in: [fileId] }, responseId: null },
      data: { responseId: 'response-id' },
    }));
  });
});
