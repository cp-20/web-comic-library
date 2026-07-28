import { renderIssueMarkdown } from '../presentation/markdown';
import { createIssueListResponse, type IssueDetail } from '../presentation/view-model';
import {
  issueExecutions,
  issuePriorities,
  issueReviewStatuses,
  issueStatuses,
  IssueStoreError,
  readIssues,
  updateIssue,
  type IssueExecution,
  type IssuePriority,
  type IssueReviewStatus,
  type IssueStatus,
} from '../storage/issue-store';
import { loadUiAssets, type UiAssets } from '../ui/assets';
import { issuePage } from '../ui/page';

type UpdateBody = Readonly<{
  execution: IssueExecution;
  priority: IssuePriority;
  reviewStatus: IssueReviewStatus;
  revision: string;
  status: IssueStatus;
}>;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.some((candidate) => candidate === value);

const parseUpdate = (value: unknown): UpdateBody | null => {
  if (typeof value !== 'object' || value === null) return null;
  const keys = Object.keys(value);
  const allowedKeys = ['execution', 'priority', 'reviewStatus', 'revision', 'status'];
  if (keys.length !== allowedKeys.length || keys.some((key) => !allowedKeys.includes(key))) {
    return null;
  }
  const execution = Reflect.get(value, 'execution');
  const priority = Reflect.get(value, 'priority');
  const reviewStatus = Reflect.get(value, 'reviewStatus');
  const revision = Reflect.get(value, 'revision');
  const status = Reflect.get(value, 'status');
  if (
    !isOneOf(issueExecutions, execution) ||
    !isOneOf(issuePriorities, priority) ||
    !isOneOf(issueReviewStatuses, reviewStatus) ||
    typeof revision !== 'string' ||
    !/^[\da-f]{64}$/u.test(revision) ||
    !isOneOf(issueStatuses, status)
  ) {
    return null;
  }
  return { execution, priority, reviewStatus, revision, status };
};

const json = (value: unknown, status = 200): Response =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

const uiResponse = (body: string, contentType: string): Response =>
  new Response(body, {
    headers: {
      'cache-control': 'no-store',
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
    },
  });

const detailFor = async (id: string, issuesDirectory: string): Promise<IssueDetail | null> => {
  const issues = await readIssues(issuesDirectory);
  const issue = issues.find((candidate) => candidate.id === id);
  if (!issue) return null;
  return { ...issue, bodyHtml: await renderIssueMarkdown(issue, issues) };
};

const errorResponse = (error: IssueStoreError): Response => {
  const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : 400;
  return json({ error: error.message }, status);
};

export const createIssueHandler = (
  issuesDirectory: string,
  csrfToken: string,
  assets: Promise<UiAssets> = loadUiAssets(),
) => {
  const page = issuePage(csrfToken);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (
      request.method === 'GET' &&
      (url.pathname === '/' || /^\/issues\/\d{3}$/u.test(url.pathname))
    ) {
      return new Response(page, {
        headers: {
          'cache-control': 'no-store',
          'content-security-policy':
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'none'",
          'content-type': 'text/html; charset=utf-8',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/assets/issues.css') {
      return uiResponse((await assets).styles, 'text/css; charset=utf-8');
    }
    if (request.method === 'GET' && url.pathname === '/assets/issues.js') {
      return uiResponse((await assets).script, 'text/javascript; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/api/issues') {
      return json(createIssueListResponse(await readIssues(issuesDirectory)));
    }

    const match = /^\/api\/issues\/(\d{3})$/u.exec(url.pathname);
    const id = match?.[1];
    if (request.method === 'GET' && id) {
      const detail = await detailFor(id, issuesDirectory);
      return detail ? json(detail) : json({ error: `issue ${id} was not found` }, 404);
    }

    if (request.method === 'PATCH' && id) {
      if (request.headers.get('x-issue-token') !== csrfToken) {
        return json({ error: 'invalid local edit token' }, 403);
      }
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== url.origin) {
        return json({ error: 'cross-origin edits are not allowed' }, 403);
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return json({ error: 'application/json is required' }, 415);
      }
      const declaredLength = Number(request.headers.get('content-length') ?? '0');
      if (declaredLength > 8_192) return json({ error: 'request body is too large' }, 413);
      const body = await request.text();
      if (body.length > 8_192) return json({ error: 'request body is too large' }, 413);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json({ error: 'invalid JSON' }, 400);
      }
      const update = parseUpdate(parsed);
      if (!update) return json({ error: 'invalid issue update' }, 400);
      try {
        await updateIssue(issuesDirectory, id, update);
        const detail = await detailFor(id, issuesDirectory);
        if (!detail) return json({ error: `issue ${id} was not found` }, 404);
        return json(detail);
      } catch (error) {
        if (error instanceof IssueStoreError) return errorResponse(error);
        throw error;
      }
    }

    return json({ error: 'not_found' }, 404);
  };
};
