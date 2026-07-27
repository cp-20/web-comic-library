import { expect, test } from 'bun:test';

import type {
  ModerationAction,
  Report,
  UserBlock,
  UserFollow,
  UserMute,
} from '@web-comic-library/domain';

import type { ModerationRepository } from './moderation';
import {
  blockUser,
  muteUser,
  performModeration,
  submitReport,
  unblockUser,
  unmuteUser,
} from './moderation';
import { TransactionContext, type TransactionPort } from './persistence';

const context = new TransactionContext();

const transactions: TransactionPort = {
  async transaction<T>(operation: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    return operation(context);
  },
};

const relationshipKey = (first: string, second: string): string => `${first}|${second}`;

const createRepository = () => {
  const blocks = new Map<string, UserBlock>();
  const mutes = new Map<string, UserMute>();
  const reports = new Map<string, Report>();
  const follows = new Map<string, UserFollow>();
  const actions: ModerationAction[] = [];
  const repository: ModerationRepository = {
    async createBlock(_context, block) {
      const id = relationshipKey(block.blockerUserUuid, block.blockedUserUuid);
      if (blocks.has(id)) return false;
      blocks.set(id, block);
      return true;
    },
    async createMute(_context, mute) {
      const id = relationshipKey(mute.muterUserUuid, mute.mutedUserUuid);
      if (mutes.has(id)) return false;
      mutes.set(id, mute);
      return true;
    },
    async createReport(_context, report) {
      const existing = [...reports.values()].find(
        (candidate) =>
          candidate.reporterUserUuid === report.reporterUserUuid &&
          candidate.targetKind === report.targetKind &&
          candidate.targetId === report.targetId,
      );
      const saved = existing
        ? {
            ...existing,
            reason: report.reason,
            status: 'open' as const,
            updatedAt: report.updatedAt,
          }
        : report;
      reports.set(saved.id, saved);
      return saved;
    },
    async deleteBlock(_context, blocker, blocked) {
      return blocks.delete(relationshipKey(blocker, blocked));
    },
    async deleteMute(_context, muter, muted) {
      return mutes.delete(relationshipKey(muter, muted));
    },
    async findReport(id) {
      return reports.get(id) ?? null;
    },
    async listModerationActions() {
      return actions;
    },
    async listReports() {
      return { items: [...reports.values()] };
    },
    async moderate(_context, input) {
      const action: ModerationAction = {
        action: input.action,
        actorUserUuid: input.actor.id,
        after: {},
        before: {},
        createdAt: new Date('2026-07-27T00:00:00Z'),
        id: `action-${actions.length + 1}`,
        reason: input.reason,
        reportId: input.reportId,
        targetId: input.targetId,
        targetKind: input.targetKind,
      };
      actions.push(action);
      return action;
    },
    async removeMutualFollows(_context, first, second) {
      follows.delete(relationshipKey(first, second));
      follows.delete(relationshipKey(second, first));
    },
  };
  return { blocks, follows, mutes, reports, repository };
};

test('blocking removes both accepted and pending follow directions without changing mute state', async () => {
  const { blocks, follows, mutes, repository } = createRepository();
  follows.set('first|second', {
    createdAt: new Date(),
    followerUserUuid: 'first',
    followedUserUuid: 'second',
    respondedAt: new Date(),
    status: 'accepted',
  });
  follows.set('second|first', {
    createdAt: new Date(),
    followerUserUuid: 'second',
    followedUserUuid: 'first',
    respondedAt: null,
    status: 'pending',
  });
  await expect(blockUser(transactions, repository, 'first', 'second')).resolves.toBe(true);
  expect(follows).toHaveLength(0);
  expect(blocks.has('first|second')).toBe(true);
  await expect(muteUser(transactions, repository, 'first', 'second')).resolves.toBe(true);
  expect(mutes.has('first|second')).toBe(true);
  await expect(unblockUser(transactions, repository, 'first', 'second')).resolves.toBe(true);
  await expect(unmuteUser(transactions, repository, 'first', 'second')).resolves.toBe(true);
});

test('a report is reopened on a repeat submission and moderation enforces roles', async () => {
  const { reports, repository } = createRepository();
  const first = await submitReport(transactions, repository, {
    reason: 'plain text report',
    reporterUserUuid: 'reporter',
    targetId: 'activity-1',
    targetKind: 'activity',
  });
  reports.set(first.id, { ...first, status: 'dismissed' });
  const repeated = await submitReport(transactions, repository, {
    reason: 'still a problem',
    reporterUserUuid: 'reporter',
    targetId: 'activity-1',
    targetKind: 'activity',
  });
  expect(repeated).toMatchObject({ id: first.id, status: 'open' });
  await expect(
    performModeration(transactions, repository, {
      action: 'hide',
      actor: { id: 'reader', role: 'user' },
      reason: 'policy violation',
      reportId: repeated.id,
      targetId: 'activity-1',
      targetKind: 'activity',
    }),
  ).rejects.toThrow('moderator');
  await expect(
    performModeration(transactions, repository, {
      action: 'suspend',
      actor: { id: 'moderator', role: 'moderator' },
      reason: 'repeat violation',
      reportId: repeated.id,
      targetId: 'profile-1',
      targetKind: 'profile',
    }),
  ).rejects.toThrow('administrator');
  await expect(
    performModeration(transactions, repository, {
      action: 'restore',
      actor: { id: 'moderator', role: 'moderator' },
      reason: 'restoration request',
      reportId: repeated.id,
      targetId: 'profile-1',
      targetKind: 'profile',
    }),
  ).rejects.toThrow('administrator');
  await expect(
    performModeration(transactions, repository, {
      action: 'suspend',
      actor: { id: 'administrator', role: 'administrator' },
      reason: 'repeat violation',
      reportId: repeated.id,
      targetId: 'profile-1',
      targetKind: 'profile',
    }),
  ).resolves.toMatchObject({ action: 'suspend', reportId: repeated.id });
});
