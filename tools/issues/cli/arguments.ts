import {
  issueExecutions,
  issuePriorities,
  issueReviewStatuses,
  issueStatuses,
  type IssueExecution,
  type IssuePriority,
  type IssueReviewStatus,
  type IssueStatus,
} from '../storage/issue-store';

export type IssueFilters = {
  execution?: IssueExecution;
  priority?: IssuePriority;
  reviewStatus?: IssueReviewStatus;
  status?: IssueStatus;
  umbrella?: string;
};

export type CliCommand =
  | Readonly<{ kind: 'help' }>
  | Readonly<{ all: boolean; filters: IssueFilters; json: boolean; kind: 'list' }>
  | Readonly<{ json: boolean; kind: 'next' }>
  | Readonly<{ id: string; json: boolean; kind: 'show' }>
  | Readonly<{ kind: 'validate' }>
  | Readonly<{
      id: string;
      json: boolean;
      kind: 'update';
      values: {
        execution?: IssueExecution;
        priority?: IssuePriority;
        reviewStatus?: IssueReviewStatus;
        status?: IssueStatus;
      };
    }>;

export class CliArgumentError extends Error {}

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  values.some((candidate) => candidate === value);

const requireId = (value: string | undefined): string => {
  if (!value || !/^\d{3}$/u.test(value)) throw new CliArgumentError('issue id must be 3 digits');
  return value;
};

const optionValue = (arguments_: readonly string[], index: number): string => {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) {
    throw new CliArgumentError(`${arguments_[index]} requires a value`);
  }
  return value;
};

const parseEnum = <T extends string>(option: string, values: readonly T[], value: string): T => {
  if (!isOneOf(values, value)) {
    throw new CliArgumentError(`${option} must be one of: ${values.join(', ')}`);
  }
  return value;
};

const parseList = (arguments_: readonly string[]): CliCommand => {
  const filters: IssueFilters = {};
  let all = false;
  let json = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--all') all = true;
    else if (argument === '--json') json = true;
    else if (argument === '--status') {
      filters.status = parseEnum(argument, issueStatuses, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--priority') {
      filters.priority = parseEnum(argument, issuePriorities, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--execution') {
      filters.execution = parseEnum(argument, issueExecutions, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--review-status') {
      filters.reviewStatus = parseEnum(
        argument,
        issueReviewStatuses,
        optionValue(arguments_, index),
      );
      index += 1;
    } else if (argument === '--umbrella') {
      filters.umbrella = requireId(optionValue(arguments_, index));
      index += 1;
    } else {
      throw new CliArgumentError(`unknown list option: ${argument}`);
    }
  }
  return { all, filters, json, kind: 'list' };
};

const parseUpdate = (id: string, arguments_: readonly string[]): CliCommand => {
  const values: {
    execution?: IssueExecution;
    priority?: IssuePriority;
    reviewStatus?: IssueReviewStatus;
    status?: IssueStatus;
  } = {};
  let json = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') json = true;
    else if (argument === '--status') {
      values.status = parseEnum(argument, issueStatuses, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--priority') {
      values.priority = parseEnum(argument, issuePriorities, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--execution') {
      values.execution = parseEnum(argument, issueExecutions, optionValue(arguments_, index));
      index += 1;
    } else if (argument === '--review-status') {
      values.reviewStatus = parseEnum(
        argument,
        issueReviewStatuses,
        optionValue(arguments_, index),
      );
      index += 1;
    } else {
      throw new CliArgumentError(`unknown update option: ${argument}`);
    }
  }
  if (Object.keys(values).length === 0) {
    throw new CliArgumentError('update requires at least one editable attribute');
  }
  return { id, json, kind: 'update', values };
};

export const parseCliArguments = (arguments_: readonly string[]): CliCommand => {
  const [command, id, ...remaining] = arguments_;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { kind: 'help' };
  }
  if (command === 'list') return parseList(arguments_.slice(1));
  if (command === 'next') {
    if ((id !== undefined && id !== '--json') || remaining.length > 0) {
      throw new CliArgumentError(`unknown next option: ${id ?? remaining[0] ?? ''}`);
    }
    return { json: id === '--json', kind: 'next' };
  }
  if (command === 'validate') {
    if (id !== undefined || remaining.length > 0) {
      throw new CliArgumentError('validate does not accept arguments');
    }
    return { kind: 'validate' };
  }
  if (command === 'show') {
    const issueId = requireId(id);
    if (remaining.length > 1 || (remaining.length === 1 && remaining[0] !== '--json')) {
      throw new CliArgumentError(`unknown show option: ${remaining[0] ?? ''}`);
    }
    return { id: issueId, json: remaining[0] === '--json', kind: 'show' };
  }
  if (command === 'update') return parseUpdate(requireId(id), remaining);
  throw new CliArgumentError(`unknown command: ${command}`);
};
