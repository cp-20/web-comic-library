import { describe, expect, test } from 'bun:test';

import { parseIssue } from '../storage/issue-store';
import { renderIssueMarkdown } from './markdown';

const issue = (id: string, slug: string, body: string) =>
  parseIssue(
    `${id}-${slug}.md`,
    `---
id: ${id}
title: Issue ${id}
type: platform
status: open
priority: P2
execution: agent
review_required: true
review_status: approved
reviewed_at: 2026-07-28T00:00:00.000Z
depends_on: []
umbrella: null
---

# Issue ${id}

${body}
`,
  );

describe('renderIssueMarkdown', () => {
  test('GFMを描画し、issue相対linkだけを内部遷移へ変換する', async () => {
    const source = issue(
      '001',
      'source',
      `| key | value |
| --- | --- |
| **strong** | ok |

[next](./002-next.md#details)
[external](https://example.com/path)
[repository file](../docs/issues.md)
<script>alert("xss")</script>`,
    );
    const target = issue('002', 'next', '## Details');

    const html = await renderIssueMarkdown(source, [source, target]);

    expect(html).toContain('<table>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('href="/issues/002#details"');
    expect(html).toContain('data-issue-id="002"');
    expect(html).toContain('data-status="open"');
    expect(html).toContain('class="issue-reference-status"');
    expect(html).toContain('着手可能');
    expect(html).toContain('title="#002 Issue 002 · 着手可能"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('../docs/issues.md');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<h1');
  });

  test('存在しないissueへの相対linkはclickableにしない', async () => {
    const source = issue('001', 'source', '[missing](./999-missing.md)');

    const html = await renderIssueMarkdown(source, [source]);

    expect(html).toContain('missing');
    expect(html).not.toContain('<a');
  });
});
