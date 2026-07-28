import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export const issueStatuses = [
  'open',
  'in_progress',
  'blocked',
  'human_action',
  'review',
  'done',
] as const;
export const issuePriorities = ['P0', 'P1', 'P2', 'P3'] as const;
export const issueExecutions = ['agent', 'human', 'tracking'] as const;
export const issueReviewStatuses = [
  'not_requested',
  'pending',
  'approved',
  'changes_requested',
  'legacy_unrecorded',
] as const;

export type IssueStatus = (typeof issueStatuses)[number];
export type IssuePriority = (typeof issuePriorities)[number];
export type IssueExecution = (typeof issueExecutions)[number];
export type IssueReviewStatus = (typeof issueReviewStatuses)[number];

export type IssueRecord = Readonly<{
  blocker: string | null;
  body: string;
  codexLimitation: string | null;
  dependsOn: readonly string[];
  execution: IssueExecution;
  filename: string;
  humanActionReason: string | null;
  id: string;
  priority: IssuePriority;
  reviewRequired: true;
  reviewedAt: string | null;
  reviewStatus: IssueReviewStatus;
  revision: string;
  status: IssueStatus;
  title: string;
  type: 'feature' | 'platform' | 'quality' | 'umbrella';
  umbrella: string | null;
}>;

export type IssueUpdate = Readonly<{
  execution: IssueExecution;
  priority: IssuePriority;
  reviewStatus: IssueReviewStatus;
  revision: string;
  status: IssueStatus;
}>;

export class IssueStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'conflict' | 'invalid' | 'not_found',
  ) {
    super(message);
  }
}

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  values.some((candidate) => candidate === value);

const hash = (content: string): string =>
  new Bun.CryptoHasher('sha256').update(content).digest('hex');

const sectionSummary = (body: string, heading: string): string | null => {
  const marker = `## ${heading}`;
  const headingIndex = body.split('\n').findIndex((line) => line.trim() === marker);
  if (headingIndex === -1) return null;
  const lines = body.split('\n').slice(headingIndex + 1);
  const nextHeading = lines.findIndex((line) => line.startsWith('## '));
  const section = lines
    .slice(0, nextHeading === -1 ? undefined : nextHeading)
    .join('\n')
    .trim();
  if (section === '') return null;
  return (section.split(/\n\s*\n/u)[0] ?? section)
    .trim()
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replaceAll(/[`*_]/gu, '')
    .replaceAll(/\r?\n/gu, '')
    .replaceAll(/[ \t]+/gu, ' ');
};

const parseNullable = (value: string | undefined): string | null => {
  if (value === undefined || value === 'null' || value === '') return null;
  return value;
};

const parseList = (value: string, filename: string): readonly string[] => {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new IssueStoreError(`${filename}: depends_on must be an inline list`, 'invalid');
  }
  const inner = value.slice(1, -1).trim();
  const dependencies = inner === '' ? [] : inner.split(',').map((entry) => entry.trim());
  if (dependencies.some((dependency) => !/^\d{3}$/u.test(dependency))) {
    throw new IssueStoreError(`${filename}: invalid depends_on id`, 'invalid');
  }
  return dependencies;
};

const requiredField = (fields: ReadonlyMap<string, string>, key: string): string => {
  const value = fields.get(key);
  if (value === undefined || value === '') {
    throw new IssueStoreError(`frontmatter field "${key}" is required`, 'invalid');
  }
  return value;
};

export const parseIssue = (filename: string, content: string): IssueRecord => {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    throw new IssueStoreError(`${filename}: frontmatter must start on the first line`, 'invalid');
  }
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) {
    throw new IssueStoreError(`${filename}: frontmatter is not closed`, 'invalid');
  }

  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closingIndex)) {
    const separator = line.indexOf(':');
    if (separator < 1) {
      throw new IssueStoreError(`${filename}: invalid frontmatter line "${line}"`, 'invalid');
    }
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const id = requiredField(fields, 'id');
  const status = requiredField(fields, 'status');
  const priority = requiredField(fields, 'priority');
  const execution = requiredField(fields, 'execution');
  const reviewStatus = requiredField(fields, 'review_status');
  const type = requiredField(fields, 'type');
  if (!/^\d{3}$/u.test(id)) throw new IssueStoreError(`${filename}: invalid id`, 'invalid');
  if (!isOneOf(issueStatuses, status))
    throw new IssueStoreError(`${filename}: invalid status`, 'invalid');
  if (!isOneOf(issuePriorities, priority))
    throw new IssueStoreError(`${filename}: invalid priority`, 'invalid');
  if (!isOneOf(issueExecutions, execution))
    throw new IssueStoreError(`${filename}: invalid execution`, 'invalid');
  if (!isOneOf(issueReviewStatuses, reviewStatus))
    throw new IssueStoreError(`${filename}: invalid review_status`, 'invalid');
  if (type !== 'feature' && type !== 'platform' && type !== 'quality' && type !== 'umbrella')
    throw new IssueStoreError(`${filename}: invalid type`, 'invalid');
  if (type === 'umbrella' && execution !== 'tracking')
    throw new IssueStoreError(`${filename}: umbrella requires tracking execution`, 'invalid');
  if (type !== 'umbrella' && execution === 'tracking')
    throw new IssueStoreError(`${filename}: tracking execution requires umbrella type`, 'invalid');
  if (requiredField(fields, 'review_required') !== 'true')
    throw new IssueStoreError(`${filename}: review_required must be true`, 'invalid');
  if (basename(filename).slice(0, 3) !== id)
    throw new IssueStoreError(`${filename}: filename and id differ`, 'invalid');
  const reviewedAt = parseNullable(fields.get('reviewed_at'));
  const umbrella = parseNullable(fields.get('umbrella'));
  if (umbrella !== null && !/^\d{3}$/u.test(umbrella))
    throw new IssueStoreError(`${filename}: invalid umbrella`, 'invalid');
  const hasReviewRecord = reviewStatus === 'approved' || reviewStatus === 'changes_requested';
  if (hasReviewRecord && reviewedAt === null) {
    throw new IssueStoreError(
      `${filename}: completed issue review requires reviewed_at`,
      'invalid',
    );
  }
  if (
    reviewedAt !== null &&
    (!Number.isFinite(Date.parse(reviewedAt)) || new Date(reviewedAt).toISOString() !== reviewedAt)
  ) {
    throw new IssueStoreError(`${filename}: reviewed_at must be an ISO timestamp`, 'invalid');
  }
  if (!hasReviewRecord && reviewedAt !== null) {
    throw new IssueStoreError(
      `${filename}: incomplete issue review cannot have reviewed_at`,
      'invalid',
    );
  }
  if (status === 'human_action' && execution !== 'human')
    throw new IssueStoreError(`${filename}: human_action requires human execution`, 'invalid');
  if (status === 'open' && execution === 'human')
    throw new IssueStoreError(`${filename}: ready human work must use human_action`, 'invalid');
  if (status === 'review' && reviewStatus !== 'pending' && reviewStatus !== 'changes_requested')
    throw new IssueStoreError(
      `${filename}: review status requires an unresolved issue review`,
      'invalid',
    );
  if (
    (status === 'open' || status === 'in_progress' || status === 'human_action') &&
    reviewStatus !== 'approved'
  ) {
    throw new IssueStoreError(
      `${filename}: actionable issue requires approved issue text`,
      'invalid',
    );
  }
  if (status === 'done' && reviewStatus !== 'approved' && reviewStatus !== 'legacy_unrecorded') {
    throw new IssueStoreError(`${filename}: done requires approved or migrated review`, 'invalid');
  }
  if (reviewStatus === 'legacy_unrecorded' && status !== 'done')
    throw new IssueStoreError(`${filename}: migrated review requires done status`, 'invalid');

  const body = lines
    .slice(closingIndex + 1)
    .join('\n')
    .trim();
  const blocker = sectionSummary(body, 'Blocker');
  const humanActionReason = sectionSummary(body, '人が操作する理由');
  const codexLimitation = sectionSummary(body, 'Codexでは実行できない理由');
  if (status === 'blocked' && blocker === null) {
    throw new IssueStoreError(`${filename}: blocked issue requires a Blocker section`, 'invalid');
  }
  if (execution === 'human' && (humanActionReason === null || codexLimitation === null)) {
    throw new IssueStoreError(
      `${filename}: human issue requires "人が操作する理由" and "Codexでは実行できない理由" sections`,
      'invalid',
    );
  }

  return {
    blocker: status === 'blocked' ? blocker : null,
    body,
    codexLimitation: execution === 'human' ? codexLimitation : null,
    dependsOn: parseList(requiredField(fields, 'depends_on'), filename),
    execution,
    filename,
    humanActionReason: execution === 'human' ? humanActionReason : null,
    id,
    priority,
    reviewRequired: true,
    reviewedAt,
    reviewStatus,
    revision: hash(content),
    status,
    title: requiredField(fields, 'title'),
    type,
    umbrella,
  };
};

export const readIssues = async (issuesDirectory: string): Promise<readonly IssueRecord[]> => {
  const entries = await readdir(issuesDirectory, { withFileTypes: true });
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^\d{3}-.*\.md$/u.test(entry.name))
      .map(async (entry) =>
        parseIssue(entry.name, await readFile(join(issuesDirectory, entry.name), 'utf8')),
      ),
  );
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new IssueStoreError(`duplicate issue id ${record.id}`, 'invalid');
    }
    ids.add(record.id);
  }
  return records.toSorted((left, right) => left.id.localeCompare(right.id));
};

const validateUpdate = (update: IssueUpdate): void => {
  if (update.execution === 'human' && update.status === 'open') {
    throw new IssueStoreError('ready human work must use status human_action', 'invalid');
  }
  if (update.execution !== 'human' && update.status === 'human_action') {
    throw new IssueStoreError('human_action is only valid for human execution', 'invalid');
  }
  if (
    update.status === 'review' &&
    update.reviewStatus !== 'pending' &&
    update.reviewStatus !== 'changes_requested'
  ) {
    throw new IssueStoreError('review status requires an unresolved issue review', 'invalid');
  }
  if (update.status === 'done' && update.reviewStatus !== 'approved') {
    throw new IssueStoreError('done requires an approved human review', 'invalid');
  }
  if (
    (update.status === 'open' ||
      update.status === 'in_progress' ||
      update.status === 'human_action') &&
    update.reviewStatus !== 'approved'
  ) {
    throw new IssueStoreError('actionable issue requires approved issue text', 'invalid');
  }
  if (update.reviewStatus === 'legacy_unrecorded' && update.status !== 'done') {
    throw new IssueStoreError(
      'legacy_unrecorded is only valid for migrated done issues',
      'invalid',
    );
  }
};

const replaceFrontmatter = (content: string, values: Readonly<Record<string, string>>): string => {
  const lines = content.split('\n');
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) throw new IssueStoreError('frontmatter is not closed', 'invalid');
  const remaining = new Set(Object.keys(values));
  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const replacement = values[key];
    if (replacement !== undefined) {
      lines[index] = `${key}: ${replacement}`;
      remaining.delete(key);
    }
  }
  if (remaining.size > 0) {
    throw new IssueStoreError(`missing editable fields: ${[...remaining].join(', ')}`, 'invalid');
  }
  return lines.join('\n');
};

const updateIssueOnDisk = async (
  issuesDirectory: string,
  id: string,
  update: IssueUpdate,
  now: Date = new Date(),
): Promise<IssueRecord> => {
  validateUpdate(update);
  const issues = await readIssues(issuesDirectory);
  const issue = issues.find((candidate) => candidate.id === id);
  if (!issue) throw new IssueStoreError(`issue ${id} was not found`, 'not_found');
  if (issue.type === 'umbrella' && update.execution !== 'tracking') {
    throw new IssueStoreError('umbrella requires tracking execution', 'invalid');
  }
  if (issue.type !== 'umbrella' && update.execution === 'tracking') {
    throw new IssueStoreError('tracking execution requires umbrella type', 'invalid');
  }
  if (issue.revision !== update.revision)
    throw new IssueStoreError('issue changed on disk; reload before saving', 'conflict');
  if (issue.reviewStatus === 'legacy_unrecorded' && update.reviewStatus === 'legacy_unrecorded') {
    throw new IssueStoreError(
      'migrated issues must receive a recorded review before editing',
      'invalid',
    );
  }

  const reviewed =
    update.reviewStatus === 'approved' || update.reviewStatus === 'changes_requested';
  const reviewedAt =
    reviewed && update.reviewStatus === issue.reviewStatus && issue.reviewedAt !== null
      ? issue.reviewedAt
      : reviewed
        ? now.toISOString()
        : 'null';
  const content = await readFile(join(issuesDirectory, issue.filename), 'utf8');
  const updatedContent = replaceFrontmatter(content, {
    execution: update.execution,
    priority: update.priority,
    reviewed_at: reviewedAt,
    review_status: update.reviewStatus,
    status: update.status,
  });
  const target = join(issuesDirectory, issue.filename);
  const temporary = join(issuesDirectory, `.${issue.filename}.${randomUUID()}.tmp`);
  const mode = (await stat(target)).mode;
  try {
    await writeFile(temporary, updatedContent, { mode });
    if (hash(await readFile(target, 'utf8')) !== update.revision) {
      throw new IssueStoreError('issue changed on disk; reload before saving', 'conflict');
    }
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return parseIssue(issue.filename, updatedContent);
};

let updateQueue: Promise<void> = Promise.resolve();

export const updateIssue = (
  issuesDirectory: string,
  id: string,
  update: IssueUpdate,
  now: Date = new Date(),
): Promise<IssueRecord> => {
  const operation = updateQueue.then(() => updateIssueOnDisk(issuesDirectory, id, update, now));
  updateQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
};
