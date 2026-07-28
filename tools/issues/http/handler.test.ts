import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIssueHandler } from './handler';

const directories: string[] = [];

const fixture = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'issue-handler-'));
  directories.push(directory);
  await writeFile(
    join(directory, '001-test.md'),
    `---
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

| key | value |
| --- | --- |
| rendered | yes |
`,
  );
  return directory;
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('issue HTTP handler', () => {
  test('一覧は軽量summary、詳細はrender済みMarkdownを返す', async () => {
    const directory = await fixture();
    const handler = createIssueHandler(
      directory,
      'secret',
      Promise.resolve({ script: 'console.log("ok")', styles: 'body{}' }),
    );

    const listResponse = await handler(new Request('http://127.0.0.1/api/issues'));
    const list: unknown = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(list).toMatchObject({ issues: [{ id: '001', title: 'Test issue' }] });
    expect(JSON.stringify(list)).not.toContain('"body"');

    const detailResponse = await handler(new Request('http://127.0.0.1/api/issues/001'));
    const detail: unknown = await detailResponse.json();
    expect(detail).toMatchObject({ bodyHtml: expect.stringContaining('<table>') });
  });

  test('pageはstrict CSPを持ち、tokenなしの更新を拒否する', async () => {
    const directory = await fixture();
    const handler = createIssueHandler(
      directory,
      'secret',
      Promise.resolve({ script: '', styles: '' }),
    );

    const page = await handler(new Request('http://127.0.0.1/issues/001'));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).not.toContain('unsafe-inline');

    const patch = await handler(
      new Request('http://127.0.0.1/api/issues/001', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      }),
    );
    expect(patch.status).toBe(403);
  });
});
