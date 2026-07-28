import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IssueStoreError, parseIssue, readIssues, updateIssue } from './issue-store';

const directories: string[] = [];
const content = `---
id: 001
title: Test issue
type: platform
status: review
priority: P2
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: []
umbrella: null
---

# Test issue

Body remains unchanged.
`;

const fixture = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'issue-store-'));
  directories.push(directory);
  await writeFile(join(directory, '001-test.md'), content);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('issue store', () => {
  test('repositoryの全issueがschemaを満たす', async () => {
    const issues = await readIssues(join(import.meta.dir, '..', '..', '..', 'issues'));
    expect(issues.length).toBeGreaterThan(0);
    expect(new Set(issues.map(({ id }) => id)).size).toBe(issues.length);
  });

  test('blocked issueから本質的なBlocker要約を抽出する', () => {
    const blocked = parseIssue(
      '001-test.md',
      content
        .replace('status: review', 'status: blocked')
        .replace(
          'Body remains unchanged.',
          'Body remains unchanged.\n\n## Blocker\n\n#002 の実装が未完了である。\n\n## 解除条件\n\n#002がdoneになること。',
        ),
    );

    expect(blocked.blocker).toBe('#002 の実装が未完了である。');
  });

  test('issue本文の承認後は実装前でもopenにできる', () => {
    const approved = parseIssue(
      '001-test.md',
      content
        .replace('status: review', 'status: open')
        .replace('review_status: pending', 'review_status: approved')
        .replace('reviewed_at: null', 'reviewed_at: 2026-07-28T00:00:00.000Z'),
    );

    expect(approved.status).toBe('open');
    expect(approved.reviewStatus).toBe('approved');
  });

  test('未承認の着手と理由のないhuman issueを拒否する', () => {
    expect(() =>
      parseIssue('001-test.md', content.replace('status: review', 'status: open')),
    ).toThrow('actionable issue requires approved issue text');
    expect(() =>
      parseIssue('001-test.md', content.replace('execution: agent', 'execution: human')),
    ).toThrow('human issue requires');
  });

  test('workflow属性だけをatomicに更新する', async () => {
    const directory = await fixture();
    const [before] = await readIssues(directory);
    if (!before) throw new Error('fixture issue is missing');

    const updated = await updateIssue(
      directory,
      before.id,
      {
        execution: 'agent',
        priority: 'P1',
        reviewStatus: 'pending',
        revision: before.revision,
        status: 'review',
      },
      new Date('2026-07-28T00:00:00.000Z'),
    );

    expect(updated.status).toBe('review');
    expect(updated.priority).toBe('P1');
    expect(updated.body).toBe(before.body);
    expect(await readFile(join(directory, before.filename), 'utf8')).toContain(
      'Body remains unchanged.',
    );
  });

  test('古いrevisionと未承認issueの完了を拒否する', async () => {
    const directory = await fixture();
    const issue = parseIssue('001-test.md', content);
    await writeFile(join(directory, issue.filename), `${content}\n`);

    expect(
      updateIssue(directory, issue.id, {
        execution: issue.execution,
        priority: issue.priority,
        reviewStatus: issue.reviewStatus,
        revision: issue.revision,
        status: issue.status,
      }),
    ).rejects.toMatchObject({ code: 'conflict' } satisfies Partial<IssueStoreError>);

    const [current] = await readIssues(directory);
    if (!current) throw new Error('fixture issue is missing');
    expect(
      updateIssue(directory, current.id, {
        execution: 'agent',
        priority: 'P2',
        reviewStatus: 'pending',
        revision: current.revision,
        status: 'done',
      }),
    ).rejects.toMatchObject({ code: 'invalid' } satisfies Partial<IssueStoreError>);
  });
});
