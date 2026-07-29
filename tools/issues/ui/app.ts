import { issueStatusLabels as statusLabels } from '../presentation/labels';
import type { IssueDetail, IssueListResponse, IssueSummary } from '../presentation/view-model';
import type {
  IssueExecution,
  IssuePriority,
  IssueReviewStatus,
  IssueStatus,
} from '../storage/issue-store';

type WorkView = 'active' | 'all' | 'done' | 'human' | 'review';
type SortOrder = 'newest' | 'oldest' | 'priority';

type Filters = {
  execution: IssueExecution | '';
  priority: IssuePriority | '';
  query: string;
  review: IssueReviewStatus | '';
  sort: SortOrder;
  status: IssueStatus | '';
  view: WorkView;
};

type EditableIssue = {
  execution: IssueExecution;
  priority: IssuePriority;
  reviewStatus: IssueReviewStatus;
  status: IssueStatus;
};

const statusDescriptions: Record<IssueStatus, string> = {
  blocked: '依存または外部判断の完了を待っています。',
  done: '実装と検証が完了しています。',
  human_action: '必要な入力がそろい、人による実施を待っています。',
  in_progress: '担当者が作業を進めています。',
  open: 'issue本文が承認済みで、agentが着手できます。',
  review: 'issue本文の人によるレビューを待っています。',
  unpolished: 'レビュー所見を記録しただけで、実装内容と本文レビューは未整理です。',
};

const executionLabels: Record<IssueExecution, string> = {
  agent: 'Agent',
  human: 'Human',
  tracking: 'Umbrella',
};

const reviewLabels: Record<IssueReviewStatus, string> = {
  approved: '承認済み',
  changes_requested: '修正依頼',
  legacy_unrecorded: '旧完了記録',
  not_requested: '未依頼',
  pending: 'レビュー待ち',
};

const priorityOrder: Record<IssuePriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const priorityLabels: Record<IssuePriority, string> = {
  P0: 'P0 · 最優先',
  P1: 'P1 · 高',
  P2: 'P2 · 通常',
  P3: 'P3 · 低',
};

const state: {
  detailCache: Map<string, IssueDetail>;
  filters: Filters;
  issues: IssueSummary[];
  options: IssueListResponse['options'] | null;
  saving: boolean;
  selectedId: string | null;
} = {
  detailCache: new Map(),
  filters: {
    execution: '',
    priority: '',
    query: '',
    review: '',
    sort: 'priority',
    status: '',
    view: 'active',
  },
  issues: [],
  options: null,
  saving: false,
  selectedId: null,
};

const isElement = <T extends Element>(
  selector: string,
  guard: (element: Element) => element is T,
): T => {
  const element = document.querySelector(selector);
  if (!element || !guard(element)) throw new Error(`missing UI element: ${selector}`);
  return element;
};

const isHtmlElement = (element: Element): element is HTMLElement => element instanceof HTMLElement;
const isInput = (element: Element): element is HTMLInputElement =>
  element instanceof HTMLInputElement;
const isSelect = (element: Element): element is HTMLSelectElement =>
  element instanceof HTMLSelectElement;
const isButton = (element: Element): element is HTMLButtonElement =>
  element instanceof HTMLButtonElement;

const issueList = isElement('#issue-list', isHtmlElement);
const issueDetail = isElement('#issue-detail', isHtmlElement);
const searchInput = isElement('#search', isInput);
const statusFilter = isElement('#status-filter', isSelect);
const executionFilter = isElement('#execution-filter', isSelect);
const priorityFilter = isElement('#priority-filter', isSelect);
const reviewFilter = isElement('#review-filter', isSelect);
const sortSelect = isElement('#sort', isSelect);
const clearFilters = isElement('#clear-filters', isButton);
const activeFilters = isElement('#active-filters', isHtmlElement);
const visibleCount = isElement('#visible-count', isHtmlElement);
const headerSummary = isElement('#header-summary', isHtmlElement);
const viewTabs = isElement('#view-tabs', isHtmlElement);
const toastRegion = isElement('#toast-region', isHtmlElement);
const token = document.querySelector<HTMLMetaElement>('meta[name="issue-token"]')?.content;
if (!token) throw new Error('missing issue edit token');

const element = <K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.some((candidate) => candidate === value);

const hasString = (value: Readonly<Record<string, unknown>>, key: string): boolean =>
  typeof value[key] === 'string';

const hasNullableString = (value: Readonly<Record<string, unknown>>, key: string): boolean =>
  value[key] === null || typeof value[key] === 'string';

const isIssueSummary = (value: unknown): value is IssueSummary => {
  if (!isRecord(value)) return false;
  return (
    hasNullableString(value, 'blocker') &&
    hasNullableString(value, 'codexLimitation') &&
    hasString(value, 'execution') &&
    hasString(value, 'filename') &&
    hasNullableString(value, 'humanActionReason') &&
    hasString(value, 'id') &&
    hasString(value, 'priority') &&
    hasString(value, 'reviewStatus') &&
    hasString(value, 'status') &&
    hasString(value, 'title') &&
    hasString(value, 'type') &&
    hasNullableString(value, 'reviewedAt') &&
    hasNullableString(value, 'umbrella') &&
    Array.isArray(value.dependsOn)
  );
};

const isIssueListResponse = (value: unknown): value is IssueListResponse => {
  if (!isRecord(value) || !Array.isArray(value.issues) || !isRecord(value.options)) return false;
  const options = value.options;
  return (
    value.issues.every(isIssueSummary) &&
    Array.isArray(options.executions) &&
    Array.isArray(options.priorities) &&
    Array.isArray(options.reviewStatuses) &&
    Array.isArray(options.statuses)
  );
};

const isIssueDetail = (value: unknown): value is IssueDetail =>
  isIssueSummary(value) &&
  isRecord(value) &&
  hasString(value, 'body') &&
  hasString(value, 'bodyHtml') &&
  hasString(value, 'revision');

const parseJson = async (response: Response): Promise<unknown> => response.json();

const readError = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.error === 'string' ? value.error : fallback;

const showToast = (message: string, tone: 'error' | 'neutral' = 'neutral'): void => {
  const toast = element('div', 'toast', message);
  toast.dataset.tone = tone;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3_500);
};

const statusTone = (status: IssueStatus): string => {
  if (status === 'unpolished') return 'attention';
  if (status === 'blocked') return 'danger';
  if (status === 'human_action') return 'attention';
  if (status === 'review') return 'done';
  if (status === 'done') return 'success';
  if (status === 'in_progress') return 'accent';
  return 'success';
};

const statusMark = (status: IssueStatus): string => {
  if (status === 'unpolished') return '○';
  if (status === 'blocked') return '!';
  if (status === 'done') return '✓';
  if (status === 'review') return '…';
  if (status === 'human_action') return '•';
  if (status === 'in_progress') return '↻';
  return '';
};

const label = (text: string, tone?: string): HTMLSpanElement => {
  const node = element('span', 'label', text);
  if (tone) node.dataset.tone = tone;
  return node;
};

const viewMatches = (issue: IssueSummary, view: WorkView): boolean => {
  if (view === 'active') return issue.status !== 'done';
  if (view === 'human') return issue.execution === 'human' && issue.status !== 'done';
  if (view === 'review')
    return issue.reviewStatus === 'pending' || issue.reviewStatus === 'changes_requested';
  if (view === 'done') return issue.status === 'done';
  return true;
};

const filteredIssues = (): IssueSummary[] => {
  const query = state.filters.query.trim().toLocaleLowerCase('ja');
  const filtered = state.issues.filter((issue) => {
    const matchesQuery =
      query === '' || `${issue.id} ${issue.title}`.toLocaleLowerCase('ja').includes(query);
    return (
      matchesQuery &&
      viewMatches(issue, state.filters.view) &&
      (state.filters.status === '' || issue.status === state.filters.status) &&
      (state.filters.execution === '' || issue.execution === state.filters.execution) &&
      (state.filters.priority === '' || issue.priority === state.filters.priority) &&
      (state.filters.review === '' || issue.reviewStatus === state.filters.review)
    );
  });

  return filtered.toSorted((left, right) => {
    if (state.filters.sort === 'newest') return right.id.localeCompare(left.id);
    if (state.filters.sort === 'oldest') return left.id.localeCompare(right.id);
    const priority = priorityOrder[left.priority] - priorityOrder[right.priority];
    return priority !== 0 ? priority : left.id.localeCompare(right.id);
  });
};

const appendOption = (select: HTMLSelectElement, value: string, text: string): void => {
  const option = element('option');
  option.value = value;
  option.textContent = text;
  select.append(option);
};

const populateFilters = (response: IssueListResponse): void => {
  for (const status of response.options.statuses) {
    appendOption(
      statusFilter,
      status,
      `${statusLabels[status]} (${response.issues.filter((issue) => issue.status === status).length})`,
    );
  }
  for (const execution of response.options.executions) {
    appendOption(
      executionFilter,
      execution,
      `${executionLabels[execution]} (${response.issues.filter((issue) => issue.execution === execution).length})`,
    );
  }
  for (const priority of response.options.priorities) {
    appendOption(
      priorityFilter,
      priority,
      `${priorityLabels[priority]} (${response.issues.filter((issue) => issue.priority === priority).length})`,
    );
  }
  for (const review of response.options.reviewStatuses) {
    appendOption(
      reviewFilter,
      review,
      `${reviewLabels[review]} (${response.issues.filter((issue) => issue.reviewStatus === review).length})`,
    );
  }
};

const updateViewCounts = (): void => {
  const views: readonly WorkView[] = ['active', 'human', 'review', 'done', 'all'];
  for (const view of views) {
    const target = document.querySelector<HTMLElement>(`[data-count="${view}"]`);
    if (target)
      target.textContent = String(state.issues.filter((issue) => viewMatches(issue, view)).length);
  }
  for (const button of viewTabs.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.filters.view));
  }
};

const filterDescription = (): readonly string[] => {
  const descriptions: string[] = [];
  if (state.filters.query) descriptions.push(`検索: ${state.filters.query}`);
  if (state.filters.status) descriptions.push(`状態: ${statusLabels[state.filters.status]}`);
  if (state.filters.execution)
    descriptions.push(`担当: ${executionLabels[state.filters.execution]}`);
  if (state.filters.priority) descriptions.push(`優先度: ${state.filters.priority}`);
  if (state.filters.review) descriptions.push(`レビュー: ${reviewLabels[state.filters.review]}`);
  return descriptions;
};

const updateFilterSummary = (): void => {
  activeFilters.replaceChildren();
  for (const description of filterDescription()) {
    activeFilters.append(element('span', 'filter-chip', description));
  }
  clearFilters.hidden = filterDescription().length === 0;
};

const renderList = (): void => {
  const visible = filteredIssues();
  issueList.replaceChildren();
  visibleCount.textContent = `${visible.length}件`;
  headerSummary.textContent = `未完了 ${state.issues.filter((issue) => issue.status !== 'done').length} · レビュー ${state.issues.filter((issue) => issue.reviewStatus === 'pending' || issue.reviewStatus === 'changes_requested').length}`;
  updateViewCounts();
  updateFilterSummary();

  if (visible.length === 0) {
    const empty = element('div', 'issue-list-empty');
    empty.append(
      element('strong', undefined, '該当するissueがありません'),
      document.createTextNode('検索語またはフィルターを変更してください。'),
    );
    issueList.append(empty);
    return;
  }

  for (const issue of visible) {
    const row = element('a', 'issue-row');
    row.href = `/issues/${issue.id}`;
    row.dataset.issueId = issue.id;
    row.setAttribute('aria-current', issue.id === state.selectedId ? 'page' : 'false');
    row.setAttribute('aria-label', `#${issue.id} ${issue.title}、${statusLabels[issue.status]}`);

    const dot = element('span', 'status-dot', statusMark(issue.status));
    dot.dataset.status = issue.status;
    dot.setAttribute('aria-hidden', 'true');

    const main = element('div', 'issue-row-main');
    main.append(element('p', 'issue-row-title', issue.title));
    const meta = element('div', 'issue-row-meta');
    meta.append(
      document.createTextNode(`#${issue.id}`),
      label(issue.priority),
      label(executionLabels[issue.execution]),
      element('span', 'spacer'),
      document.createTextNode(statusLabels[issue.status]),
    );
    main.append(meta);
    if (issue.blocker) {
      main.append(element('p', 'issue-row-blocker', `Blocker: ${issue.blocker}`));
    }
    row.append(dot, main);
    issueList.append(row);
  }
};

const setUrl = (id: string | null, replace = false): void => {
  const url = new URL(window.location.href);
  url.pathname = id ? `/issues/${id}` : '/';
  const entries: readonly [string, string][] = [
    ['view', state.filters.view === 'active' ? '' : state.filters.view],
    ['q', state.filters.query],
    ['status', state.filters.status],
    ['execution', state.filters.execution],
    ['priority', state.filters.priority],
    ['review', state.filters.review],
    ['sort', state.filters.sort === 'priority' ? '' : state.filters.sort],
  ];
  url.search = '';
  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
  }
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
};

const parseInitialState = (): void => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const sort = params.get('sort');
  state.filters.view =
    view === 'all' || view === 'done' || view === 'human' || view === 'review' ? view : 'active';
  state.filters.sort = sort === 'newest' || sort === 'oldest' ? sort : 'priority';
  state.filters.query = params.get('q') ?? '';
  const path = /^\/issues\/(\d{3})$/u.exec(window.location.pathname);
  state.selectedId = path?.[1] ?? null;
};

const restoreFilterControls = (): void => {
  searchInput.value = state.filters.query;
  statusFilter.value = state.filters.status;
  executionFilter.value = state.filters.execution;
  priorityFilter.value = state.filters.priority;
  reviewFilter.value = state.filters.review;
  sortSelect.value = state.filters.sort;
};

const lookupIssue = (id: string): IssueSummary | undefined =>
  state.issues.find((issue) => issue.id === id);

const linkToIssue = (id: string, text?: string): HTMLAnchorElement => {
  const anchor = element('a', undefined, text ?? `#${id}`);
  anchor.href = `/issues/${id}`;
  anchor.dataset.issueId = id;
  return anchor;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : value;
};

const createSelect = <T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  selected: T,
): HTMLSelectElement => {
  const select = element('select');
  for (const value of values) {
    const option = element('option');
    option.value = value;
    option.textContent = `${labels[value]} · ${value}`;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
};

const toEditable = (issue: IssueDetail): EditableIssue => ({
  execution: issue.execution,
  priority: issue.priority,
  reviewStatus: issue.reviewStatus,
  status: issue.status,
});

const sameEditable = (left: EditableIssue, right: EditableIssue): boolean =>
  left.execution === right.execution &&
  left.priority === right.priority &&
  left.reviewStatus === right.reviewStatus &&
  left.status === right.status;

const validateDraft = (draft: EditableIssue): string | null => {
  if (draft.status === 'unpolished' && draft.reviewStatus !== 'not_requested')
    return '「要整理」はissue本文のレビューを依頼する前だけに使えます。';
  if (draft.execution === 'human' && draft.status === 'open')
    return 'Humanの着手可能状態には「人の対応待ち」を使ってください。';
  if (draft.execution !== 'human' && draft.status === 'human_action')
    return '「人の対応待ち」はHuman issueだけで利用できます。';
  if (
    draft.status === 'review' &&
    draft.reviewStatus !== 'pending' &&
    draft.reviewStatus !== 'changes_requested'
  )
    return 'レビュー状態が未解決のissueだけ「レビュー待ち」にできます。';
  if (draft.status === 'done' && draft.reviewStatus !== 'approved')
    return '実装前にissue本文の承認が必要です。';
  if (
    (draft.status === 'open' ||
      draft.status === 'in_progress' ||
      draft.status === 'human_action') &&
    draft.reviewStatus !== 'approved'
  )
    return '着手可能なissueには、issue本文の承認が必要です。';
  return null;
};

const synchronizeDraft = (
  draft: EditableIssue,
  changed: 'execution' | 'review' | 'status',
): EditableIssue => {
  const next = { ...draft };
  if (changed === 'execution') {
    if (next.execution === 'human' && next.status === 'open') next.status = 'human_action';
    if (next.execution !== 'human' && next.status === 'human_action') next.status = 'open';
  }
  if (changed === 'status') {
    if (next.status === 'review' && next.reviewStatus === 'not_requested')
      next.reviewStatus = 'pending';
  }
  if (changed === 'review') {
    if (next.reviewStatus === 'pending') {
      if (next.status !== 'blocked') next.status = 'review';
    } else if (next.reviewStatus === 'approved') {
      if (next.status === 'review')
        next.status = next.execution === 'human' ? 'human_action' : 'open';
    } else if (next.reviewStatus === 'changes_requested') {
      if (next.status !== 'blocked') next.status = 'review';
    } else if (next.reviewStatus === 'not_requested') {
      if (next.status !== 'blocked') next.status = 'review';
    }
  }
  return next;
};

const summaryFromDetail = ({
  body: _body,
  bodyHtml: _bodyHtml,
  revision: _revision,
  ...summary
}: IssueDetail): IssueSummary => summary;

const renderWorkflow = (issue: IssueDetail): HTMLElement => {
  const card = element('aside', 'workflow-card');
  const header = element('div', 'workflow-card-header');
  header.append(element('h2', undefined, 'Workflow'));
  const dirtyIndicator = element('span', 'dirty-indicator');
  header.append(dirtyIndicator);

  const form = element('form', 'workflow-form');
  const status = createSelect(state.options?.statuses ?? [], statusLabels, issue.status);
  const priority = createSelect(state.options?.priorities ?? [], priorityLabels, issue.priority);
  const execution = createSelect(state.options?.executions ?? [], executionLabels, issue.execution);
  const review = createSelect(
    state.options?.reviewStatuses ?? [],
    reviewLabels,
    issue.reviewStatus,
  );
  if (issue.type === 'umbrella') execution.disabled = true;
  for (const option of execution.options) {
    if (option.value === 'tracking' && issue.type !== 'umbrella') option.disabled = true;
  }
  for (const option of review.options) {
    if (option.value === 'legacy_unrecorded' && issue.reviewStatus !== 'legacy_unrecorded') {
      option.disabled = true;
    }
  }

  const field = (title: string, control: HTMLElement): HTMLLabelElement => {
    const labelElement = element('label', 'workflow-field');
    labelElement.append(element('span', undefined, title), control);
    return labelElement;
  };

  form.append(
    field('Status', status),
    field('Priority', priority),
    field('Execution', execution),
    field('Issue review', review),
  );

  const help = element('div', 'workflow-help');
  const actions = element('div', 'workflow-actions');
  const reset = element('button', 'button', '元に戻す');
  reset.type = 'button';
  const save = element('button', 'button button-primary', '変更を保存');
  save.type = 'submit';
  actions.append(reset, save);
  form.append(help, actions);

  const original = toEditable(issue);
  let draft = { ...original };

  const readDraft = (): EditableIssue => {
    const options = state.options;
    if (
      !options ||
      !isOneOf(options.executions, execution.value) ||
      !isOneOf(options.priorities, priority.value) ||
      !isOneOf(options.reviewStatuses, review.value) ||
      !isOneOf(options.statuses, status.value)
    ) {
      throw new Error('workflow control has an invalid value');
    }
    return {
      execution: execution.value,
      priority: priority.value,
      reviewStatus: review.value,
      status: status.value,
    };
  };

  const writeDraft = (): void => {
    status.value = draft.status;
    priority.value = draft.priority;
    execution.value = draft.execution;
    review.value = draft.reviewStatus;
  };

  const refresh = (): void => {
    draft = readDraft();
    const error = validateDraft(draft);
    const dirty = !sameEditable(original, draft);
    dirtyIndicator.textContent = dirty ? '未保存' : '';
    help.dataset.error = String(error !== null);
    help.textContent =
      error ??
      (issue.reviewStatus === 'legacy_unrecorded'
        ? 'このissueを変更するには、issue本文を人が確認し、承認または修正依頼を記録してください。'
        : statusDescriptions[draft.status]);
    reset.disabled = !dirty || state.saving;
    save.disabled = !dirty || error !== null || state.saving;
  };

  status.addEventListener('change', () => {
    draft = synchronizeDraft(readDraft(), 'status');
    writeDraft();
    refresh();
  });
  execution.addEventListener('change', () => {
    draft = synchronizeDraft(readDraft(), 'execution');
    writeDraft();
    refresh();
  });
  review.addEventListener('change', () => {
    draft = synchronizeDraft(readDraft(), 'review');
    writeDraft();
    refresh();
  });
  priority.addEventListener('change', refresh);
  reset.addEventListener('click', () => {
    draft = { ...original };
    writeDraft();
    refresh();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    draft = readDraft();
    const error = validateDraft(draft);
    if (error || state.saving) return;
    state.saving = true;
    refresh();
    save.textContent = '保存中…';
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        body: JSON.stringify({ ...draft, revision: issue.revision }),
        headers: { 'content-type': 'application/json', 'x-issue-token': token },
        method: 'PATCH',
      });
      const value = await parseJson(response);
      if (!response.ok) throw new Error(readError(value, '変更を保存できませんでした。'));
      if (!isIssueDetail(value)) throw new Error('更新結果の形式が不正です。');
      state.detailCache.set(value.id, value);
      state.issues = state.issues.map((candidate) =>
        candidate.id === value.id ? summaryFromDetail(value) : candidate,
      );
      showToast(`#${value.id} を更新しました。`);
      renderList();
      renderDetail(value);
    } catch (error_) {
      showToast(error_ instanceof Error ? error_.message : '変更を保存できませんでした。', 'error');
    } finally {
      state.saving = false;
      save.textContent = '変更を保存';
      refresh();
    }
  });

  refresh();

  const context = element('div', 'workflow-context');
  const list = element('dl');
  const appendContext = (term: string, value: Node): void => {
    list.append(element('dt', undefined, term), element('dd'));
    list.lastElementChild?.append(value);
  };
  appendContext('Type', document.createTextNode(issue.type));
  if (issue.umbrella) {
    const parent = lookupIssue(issue.umbrella);
    appendContext('Umbrella', linkToIssue(issue.umbrella, parent?.title ?? `#${issue.umbrella}`));
  }
  if (issue.dependsOn.length > 0) {
    const dependencies = document.createDocumentFragment();
    issue.dependsOn.forEach((id, index) => {
      if (index > 0) dependencies.append(document.createTextNode(', '));
      dependencies.append(linkToIssue(id));
    });
    appendContext('Depends on', dependencies);
  }
  if (issue.blocker) appendContext('Blocker', document.createTextNode(issue.blocker));
  if (issue.humanActionReason)
    appendContext('Human action', document.createTextNode(issue.humanActionReason));
  if (issue.codexLimitation)
    appendContext('Why not Codex', document.createTextNode(issue.codexLimitation));
  if (issue.reviewedAt)
    appendContext('Reviewed', document.createTextNode(formatDate(issue.reviewedAt)));
  context.append(list);
  card.append(header, form, context);
  return card;
};

const renderDetail = (issue: IssueDetail): void => {
  issueDetail.replaceChildren();
  document.body.dataset.hasSelection = 'true';

  const header = element('header', 'detail-header');
  const breadcrumbs = element('div', 'detail-breadcrumbs');
  const back = element('a', undefined, 'Issues');
  back.href = '/';
  back.dataset.backToList = 'true';
  breadcrumbs.append(back);
  if (issue.umbrella) {
    const parent = lookupIssue(issue.umbrella);
    breadcrumbs.append(
      document.createTextNode('/'),
      linkToIssue(issue.umbrella, parent?.title ?? `#${issue.umbrella}`),
    );
  }
  const title = element('h1');
  title.append(
    document.createTextNode(issue.title),
    document.createTextNode(' '),
    element('span', 'issue-number', `#${issue.id}`),
  );
  const labels = element('div', 'detail-labels');
  labels.append(
    label(statusLabels[issue.status], statusTone(issue.status)),
    label(issue.priority),
    label(executionLabels[issue.execution]),
    label(reviewLabels[issue.reviewStatus]),
  );
  header.append(breadcrumbs, title, labels);

  const grid = element('div', 'detail-grid');
  const documentCard = element('div', 'document-card');
  documentCard.append(element('div', 'document-card-header', issue.filename));
  const markdown = element('article', 'markdown-body');
  markdown.innerHTML = issue.bodyHtml;
  documentCard.append(markdown);
  grid.append(documentCard, renderWorkflow(issue));
  issueDetail.append(header, grid);
  issueDetail.scrollTop = 0;
  renderList();
};

const loadDetail = async (id: string): Promise<void> => {
  const summary = lookupIssue(id);
  if (!summary) {
    issueDetail.replaceChildren(
      element('div', 'detail-error', `Issue #${id} は見つかりませんでした。`),
    );
    return;
  }
  const cached = state.detailCache.get(id);
  if (cached) {
    renderDetail(cached);
    return;
  }
  issueDetail.replaceChildren(element('div', 'detail-loading', 'Issueを読み込んでいます…'));
  try {
    const response = await fetch(`/api/issues/${id}`);
    const value = await parseJson(response);
    if (!response.ok) throw new Error(readError(value, 'Issueを読み込めませんでした。'));
    if (!isIssueDetail(value)) throw new Error('Issue詳細の形式が不正です。');
    state.detailCache.set(id, value);
    renderDetail(value);
  } catch (error) {
    const failure = element('div', 'detail-error');
    failure.append(
      element('h2', undefined, 'Issueを読み込めませんでした'),
      element(
        'p',
        undefined,
        error instanceof Error ? error.message : 'terminalを確認して再読み込みしてください。',
      ),
    );
    issueDetail.replaceChildren(failure);
  }
};

const selectIssue = (id: string, pushHistory = true): void => {
  state.selectedId = id;
  if (pushHistory) setUrl(id);
  void loadDetail(id);
  renderList();
};

const clearSelection = (pushHistory = true): void => {
  state.selectedId = null;
  delete document.body.dataset.hasSelection;
  if (pushHistory) setUrl(null);
  renderList();
};

const applyFilters = (pushHistory = true): void => {
  const options = state.options;
  state.filters.query = searchInput.value.trim();
  state.filters.status =
    options && isOneOf(options.statuses, statusFilter.value) ? statusFilter.value : '';
  state.filters.execution =
    options && isOneOf(options.executions, executionFilter.value) ? executionFilter.value : '';
  state.filters.priority =
    options && isOneOf(options.priorities, priorityFilter.value) ? priorityFilter.value : '';
  state.filters.review =
    options && isOneOf(options.reviewStatuses, reviewFilter.value) ? reviewFilter.value : '';
  state.filters.sort = isOneOf(['newest', 'oldest', 'priority'], sortSelect.value)
    ? sortSelect.value
    : 'priority';
  if (pushHistory) setUrl(state.selectedId, true);
  renderList();
};

viewTabs.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('[data-view]');
  const view = button?.dataset.view;
  if (
    view !== 'active' &&
    view !== 'human' &&
    view !== 'review' &&
    view !== 'done' &&
    view !== 'all'
  )
    return;
  state.filters.view = view;
  setUrl(state.selectedId, true);
  renderList();
});

for (const control of [
  searchInput,
  statusFilter,
  executionFilter,
  priorityFilter,
  reviewFilter,
  sortSelect,
]) {
  control.addEventListener('input', () => applyFilters());
}

clearFilters.addEventListener('click', () => {
  state.filters = {
    ...state.filters,
    execution: '',
    priority: '',
    query: '',
    review: '',
    status: '',
  };
  restoreFilterControls();
  setUrl(state.selectedId, true);
  renderList();
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const issueLink = target.closest<HTMLAnchorElement>('a[data-issue-id]');
  if (
    issueLink?.dataset.issueId &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    selectIssue(issueLink.dataset.issueId);
    return;
  }
  const back = target.closest<HTMLAnchorElement>('a[data-back-to-list]');
  if (back) {
    event.preventDefault();
    clearSelection();
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  if (event.key === '/' && !editing) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && target === searchInput && searchInput.value) {
    searchInput.value = '';
    applyFilters();
  }
  if (!editing && (event.key === 'j' || event.key === 'k')) {
    const visible = filteredIssues();
    if (visible.length === 0) return;
    const current = visible.findIndex((issue) => issue.id === state.selectedId);
    const offset = event.key === 'j' ? 1 : -1;
    const next = visible[Math.max(0, Math.min(visible.length - 1, current + offset))];
    if (next) {
      event.preventDefault();
      selectIssue(next.id);
    }
  }
});

window.addEventListener('popstate', () => {
  const path = /^\/issues\/(\d{3})$/u.exec(window.location.pathname);
  const id = path?.[1] ?? null;
  if (id) {
    state.selectedId = id;
    void loadDetail(id);
  } else {
    clearSelection(false);
  }
});

const start = async (): Promise<void> => {
  parseInitialState();
  try {
    const response = await fetch('/api/issues');
    const value = await parseJson(response);
    if (!response.ok) throw new Error(readError(value, 'Issue一覧を読み込めませんでした。'));
    if (!isIssueListResponse(value)) throw new Error('Issue一覧の形式が不正です。');
    state.issues = [...value.issues];
    state.options = value.options;
    populateFilters(value);

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const execution = params.get('execution');
    const priority = params.get('priority');
    const review = params.get('review');
    if (isOneOf(value.options.statuses, status)) state.filters.status = status;
    if (isOneOf(value.options.executions, execution)) state.filters.execution = execution;
    if (isOneOf(value.options.priorities, priority)) state.filters.priority = priority;
    if (isOneOf(value.options.reviewStatuses, review)) state.filters.review = review;

    restoreFilterControls();
    renderList();
    if (state.selectedId) await loadDetail(state.selectedId);
    setUrl(state.selectedId, true);
  } catch (error) {
    issueList.replaceChildren(
      element(
        'div',
        'issue-list-empty',
        error instanceof Error ? error.message : 'Issue一覧を読み込めませんでした。',
      ),
    );
  }
};

void start();
