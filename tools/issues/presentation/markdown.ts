import type { IssueRecord } from '../storage/issue-store';
import { issueStatusLabels } from './labels';

const issueLinkPattern = /^\.\/(\d{3})-[^/?#]+\.md(#[\w\-.:]+)?$/u;
const externalLinkPattern = /^https?:\/\//u;

const markdownOptions = {
  autolinks: true,
  headings: { ids: true },
  noHtmlBlocks: true,
  noHtmlSpans: true,
  strikethrough: true,
  tables: true,
  tagFilter: true,
  tasklists: true,
} as const;

const withoutDocumentTitle = (body: string): string => {
  const lines = body.split('\n');
  const firstContent = lines.findIndex((line) => line.trim() !== '');
  if (firstContent >= 0 && lines[firstContent]?.startsWith('# ')) {
    lines.splice(firstContent, 1);
  }
  return lines.join('\n').trimStart();
};

const rewriteLinks = async (
  html: string,
  issuesByFilename: ReadonlyMap<string, IssueRecord>,
): Promise<string> =>
  new HTMLRewriter()
    .on('a', {
      element(element) {
        const href = element.getAttribute('href');
        if (href === null) {
          element.removeAndKeepContent();
          return;
        }

        const issueMatch = issueLinkPattern.exec(href);
        if (issueMatch) {
          const targetFilename = href.slice(2).split('#', 1)[0];
          const target = targetFilename ? issuesByFilename.get(targetFilename) : undefined;
          if (!target) {
            element.removeAndKeepContent();
            return;
          }
          element.setAttribute('href', `/issues/${target.id}${issueMatch[2] ?? ''}`);
          element.setAttribute('data-issue-id', target.id);
          element.setAttribute('data-status', target.status);
          element.setAttribute('class', 'issue-reference');
          element.setAttribute(
            'aria-label',
            `Issue ${target.id}: ${target.title}、${issueStatusLabels[target.status]}`,
          );
          element.setAttribute(
            'title',
            `#${target.id} ${target.title} · ${issueStatusLabels[target.status]}`,
          );
          element.append(
            `<span class="issue-reference-status" aria-hidden="true"><span class="issue-reference-dot"></span>${issueStatusLabels[target.status]}</span>`,
            { html: true },
          );
          return;
        }

        if (href.startsWith('#')) return;

        if (externalLinkPattern.test(href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
          return;
        }

        element.removeAndKeepContent();
      },
    })
    .on('img', {
      element(element) {
        element.remove();
      },
    })
    .transform(new Response(html))
    .text();

export const renderIssueMarkdown = async (
  issue: IssueRecord,
  allIssues: readonly IssueRecord[],
): Promise<string> => {
  const issuesByFilename = new Map(allIssues.map((candidate) => [candidate.filename, candidate]));
  const html = Bun.markdown.html(withoutDocumentTitle(issue.body), markdownOptions);
  return rewriteLinks(html, issuesByFilename);
};
