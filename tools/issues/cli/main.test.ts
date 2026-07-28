import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runIssueCli } from './main';

const directories: string[] = [];

const issue = (
  id: string,
  status: 'done' | 'open',
  dependency: string,
  reviewStatus: 'approved' | 'not_requested',
) => `---
id: ${id}
title: Issue ${id}
type: platform
status: ${status}
priority: P2
execution: agent
review_required: true
review_status: ${reviewStatus}
reviewed_at: 2026-07-28T00:00:00.000Z
depends_on: [${dependency}]
umbrella: null
---

# Issue ${id}
`;

const fixture = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'issue-cli-'));
  directories.push(directory);
  await writeFile(join(directory, '001-done.md'), issue('001', 'done', '', 'approved'));
  await writeFile(join(directory, '002-ready.md'), issue('002', 'open', '001', 'approved'));
  return directory;
};

const invoke = async (arguments_: readonly string[], directory: string) => {
  const output: string[] = [];
  const errors: string[] = [];
  const code = await runIssueCli(arguments_, directory, {
    error: (value) => errors.push(value),
    output: (value) => output.push(value),
  });
  return { code, errors, output };
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('issue CLI', () => {
  test('listは既定で未完了だけを返し、nextは依存解決済みagent issueを返す', async () => {
    const directory = await fixture();

    const list = await invoke(['list', '--json'], directory);
    const next = await invoke(['next', '--json'], directory);

    expect(list.code).toBe(0);
    expect(list.output[0]).toContain('"id": "002"');
    expect(list.output[0]).not.toContain('"id": "001"');
    expect(list.output[0]).toContain('"blocker": null');
    expect(next.output[0]).toContain('"id": "002"');
  });

  test('partial updateは本文を変えず現在revisionを使う', async () => {
    const directory = await fixture();

    const result = await invoke(['update', '002', '--priority', 'P3', '--json'], directory);
    const shown = await invoke(['show', '002', '--json'], directory);

    expect(result.code).toBe(0);
    expect(result.output[0]).toContain('"priority": "P3"');
    expect(shown.output[0]).toContain('"body": "# Issue 002"');
    expect(shown.output[0]).toContain('"reviewedAt": "2026-07-28T00:00:00.000Z"');
  });

  test('validateは依存graphを検証する', async () => {
    const directory = await fixture();

    expect(await invoke(['validate'], directory)).toMatchObject({
      code: 0,
      output: ['valid: 2 issues'],
    });
  });
});
