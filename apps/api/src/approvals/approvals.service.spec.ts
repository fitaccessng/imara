import 'reflect-metadata';

jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalDecision, ApprovalRequestStatus, ApprovalReviewMode, WorkspaceRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import { ApprovalAction } from './approvals.dto';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService', () => {
  const tx = {
    approvalRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    approvalRequestStep: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    approvalRequestApprover: {
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    approvalActivity: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const approvalRequestFindFirst = jest.fn();
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    approvalRequest: { findFirst: approvalRequestFindFirst, findMany: jest.fn() },
    approvalRequestApprover: { findMany: jest.fn() },
    approvalTemplate: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findFirstOrThrow: jest.fn() },
    workspaceMember: { findMany: jest.fn() },
    storedFile: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  } as unknown as PrismaService;
  const workspaces = {
    authorizeWorkspace: jest.fn(),
    authorizeFolder: jest.fn(),
  } as unknown as WorkspacesService;
  const service = new ApprovalsService(prisma, workspaces);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(workspaces.authorizeWorkspace).mockImplementation(async (_workspaceId, userId) => ({
      id: userId === 'approver-user' ? 'approver-member' : 'requester-member',
      role: WorkspaceRole.STAFF,
    } as Awaited<ReturnType<WorkspacesService['authorizeWorkspace']>>));
    jest.mocked(tx.approvalRequest.findFirst).mockResolvedValue({
      id: 'request-id',
      title: 'Purchase approval',
      requester: { id: 'requester-user' },
      status: ApprovalRequestStatus.IN_PROGRESS,
      currentStepOrder: 0,
    });
    jest.mocked(tx.approvalRequestStep.findFirst)
      .mockResolvedValueOnce({
        id: 'step-0',
        stepOrder: 0,
        approvers: [{
          id: 'assignment-0',
          memberId: 'approver-member',
          decision: ApprovalDecision.PENDING,
        }],
      })
      .mockResolvedValueOnce(null);
    jest.mocked(tx.approvalRequestApprover.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(tx.approvalRequestApprover.count).mockResolvedValue(0);
    jest.mocked(tx.approvalRequestStep.update).mockResolvedValue({});
    jest.mocked(tx.approvalRequest.update).mockResolvedValue({});
    jest.mocked(tx.approvalActivity.create).mockResolvedValue({});
    jest.mocked(tx.auditLog.create).mockResolvedValue({});
    jest.mocked(tx.notification.createMany).mockResolvedValue({ count: 1 });
  });

  it('requires feedback when rejecting or asking for changes', async () => {
    await expect(service.decide(
      'workspace-id',
      'request-id',
      'approver-user',
      ApprovalAction.REJECTED,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records comments from request participants in the decision history', async () => {
    approvalRequestFindFirst.mockResolvedValue({
      id: 'request-id',
      requesterId: 'requester-user',
      steps: [],
    });

    await expect(service.comment('workspace-id', 'request-id', 'requester-user', 'Updated quote attached'))
      .resolves.toEqual({ id: 'request-id', commented: true });

    expect(tx.approvalActivity.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-id',
        actorId: 'requester-user',
        action: 'COMMENT',
        comment: 'Updated quote attached',
      },
    });
  });

  it('does not disclose approval requests to non-participants', async () => {
    approvalRequestFindFirst.mockResolvedValue({
      id: 'request-id',
      requesterId: 'another-user',
      steps: [{ approvers: [{ memberId: 'another-member' }] }],
    });

    await expect(service.comment('workspace-id', 'request-id', 'approver-user', 'Private note'))
      .rejects.toThrow('Approval request not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows only the active assignee to decide the current step', async () => {
    jest.mocked(tx.approvalRequestStep.findFirst).mockReset().mockResolvedValue({
      id: 'step-0',
      stepOrder: 0,
      approvers: [{ id: 'assignment-0', memberId: 'another-member', decision: ApprovalDecision.PENDING }],
    });

    await expect(service.decide(
      'workspace-id',
      'request-id',
      'approver-user',
      ApprovalAction.APPROVED,
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.approvalRequestApprover.updateMany).not.toHaveBeenCalled();
  });

  it('advances to the next sequential stage and notifies its approver', async () => {
    jest.mocked(tx.approvalRequestStep.findFirst)
      .mockReset()
      .mockResolvedValueOnce({
        id: 'step-0',
        stepOrder: 0,
        approvers: [{ id: 'assignment-0', memberId: 'approver-member', decision: ApprovalDecision.PENDING }],
      })
      .mockResolvedValueOnce({
        id: 'step-1',
        stepOrder: 1,
        approvers: [{ member: { userId: 'next-approver-user' } }],
      });

    await expect(service.decide(
      'workspace-id',
      'request-id',
      'approver-user',
      ApprovalAction.APPROVED,
      'Budget reviewed',
    )).resolves.toEqual({
      id: 'request-id',
      decision: ApprovalAction.APPROVED,
      status: ApprovalRequestStatus.IN_PROGRESS,
      currentStepOrder: 1,
    });

    expect(tx.approvalRequestStep.update).toHaveBeenCalledWith({
      where: { id: 'step-0' },
      data: { isComplete: true },
    });
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-id' },
      data: { status: ApprovalRequestStatus.IN_PROGRESS, currentStepOrder: 1 },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [{
        workspaceId: 'workspace-id',
        userId: 'next-approver-user',
        type: 'APPROVAL_ACTION_REQUIRED',
        message: 'Approval required: Purchase approval',
        metadata: { requestId: 'request-id' },
      }],
    });
  });

  it('requires sequential template stages to have one approver', async () => {
    jest.mocked(workspaces.authorizeWorkspace).mockResolvedValue({
      id: 'admin-member',
      role: WorkspaceRole.OWNER,
    } as Awaited<ReturnType<WorkspacesService['authorizeWorkspace']>>);

    await expect(service.createTemplate('workspace-id', 'owner-user', {
      name: 'Purchase',
      steps: [{
        mode: ApprovalReviewMode.SEQUENTIAL,
        approverMemberIds: ['member-a', 'member-b'],
      }],
    })).rejects.toThrow('Sequential steps must have exactly one approver');
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled();
  });
});
