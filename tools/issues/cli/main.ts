import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { IssueStoreError, readIssues, updateIssue, type IssueRecord } from '../storage/issue-store';
import { CliArgumentError, parseCliArguments, type IssueFilters } from './arguments';

type CliIo = Readonly<{
  error: (value: string) => void;
  output: (value: string) => void;
}>;

const help = `Usage: bun run issues:cli -- <command>

Commands:
  list [--all] [--status VALUE] [--priority VALUE] [--execution VALUE]
       [--review-status VALUE] [--umbrella ID] [--json]
  next [--json]
  show ID [--json]
  update ID [--status VALUE] [--priority VALUE] [--execution VALUE]
            [--review-status VALUE] [--json]
  validate
`;

const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

const matchesFilters = (issue: IssueRecord, filters: IssueFilters): boolean =>
  (filters.status === undefined || issue.status === filters.status) &&
  (filters.priority === undefined || issue.priority === filters.priority) &&
  (filters.execution === undefined || issue.execution === filters.execution) &&
  (filters.reviewStatus === undefined || issue.reviewStatus === filters.reviewStatus) &&
  (filters.umbrella === undefined || issue.umbrella === filters.umbrella);

const summarize = ({
  body: _body,
  revision: _revision,
  ...summary
}: IssueRecord): Omit<IssueRecord, 'body' | 'revision'> => summary;

const renderRows = (issues: readonly IssueRecord[]): string => {
  const lines = ['ID\tSTATUS\tPRIORITY\tEXECUTION\tREVIEW\tBLOCKER\tTITLE'];
  for (const issue of issues) {
    lines.push(
      [
        issue.id,
        issue.status,
        issue.priority,
        issue.execution,
        issue.reviewStatus,
        issue.blocker ?? '',
        issue.title,
      ].join('\t'),
    );
  }
  return lines.join('\n');
};

const validateGraph = (issues: readonly IssueRecord[]): readonly string[] => {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const errors: string[] = [];
  for (const issue of issues) {
    for (const dependency of issue.dependsOn) {
      if (!byId.has(dependency)) errors.push(`#${issue.id}: missing dependency #${dependency}`);
      if (dependency === issue.id) errors.push(`#${issue.id}: issue depends on itself`);
    }
    if (issue.umbrella !== null) {
      const umbrella = byId.get(issue.umbrella);
      if (!umbrella) errors.push(`#${issue.id}: missing umbrella #${issue.umbrella}`);
      else if (umbrella.type !== 'umbrella') {
        errors.push(`#${issue.id}: parent #${issue.umbrella} is not an umbrella`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (visiting.has(id)) {
      errors.push(`dependency cycle: ${[...path, id].map((value) => `#${value}`).join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    const issue = byId.get(id);
    if (!issue) return;
    visiting.add(id);
    for (const dependency of issue.dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const issue of issues) visit(issue.id, []);
  return [...new Set(errors)].toSorted();
};

export const runIssueCli = async (
  arguments_: readonly string[],
  issuesDirectory: string,
  io: CliIo,
): Promise<number> => {
  try {
    const command = parseCliArguments(arguments_);
    if (command.kind === 'help') {
      io.output(help.trimEnd());
      return 0;
    }

    const issues = await readIssues(issuesDirectory);
    if (command.kind === 'validate') {
      const errors = validateGraph(issues);
      if (errors.length > 0) {
        errors.forEach(io.error);
        return 1;
      }
      io.output(`valid: ${issues.length} issues`);
      return 0;
    }

    if (command.kind === 'list') {
      const selected = issues.filter(
        (issue) =>
          (command.all || issue.status !== 'done') && matchesFilters(issue, command.filters),
      );
      io.output(
        command.json ? JSON.stringify(selected.map(summarize), null, 2) : renderRows(selected),
      );
      return 0;
    }

    if (command.kind === 'next') {
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      const selected = issues
        .filter(
          (issue) =>
            issue.execution === 'agent' &&
            issue.status === 'open' &&
            issue.reviewStatus === 'approved' &&
            issue.dependsOn.every((id) => byId.get(id)?.status === 'done'),
        )
        .toSorted(
          (left, right) =>
            priorityOrder[left.priority] - priorityOrder[right.priority] ||
            left.id.localeCompare(right.id),
        );
      io.output(
        command.json ? JSON.stringify(selected.map(summarize), null, 2) : renderRows(selected),
      );
      return 0;
    }

    const issue = issues.find((candidate) => candidate.id === command.id);
    if (!issue) throw new IssueStoreError(`issue ${command.id} was not found`, 'not_found');
    if (command.kind === 'show') {
      io.output(
        command.json
          ? JSON.stringify(issue, null, 2)
          : await readFile(join(issuesDirectory, issue.filename), 'utf8'),
      );
      return 0;
    }

    const updated = await updateIssue(issuesDirectory, issue.id, {
      execution: command.values.execution ?? issue.execution,
      priority: command.values.priority ?? issue.priority,
      reviewStatus: command.values.reviewStatus ?? issue.reviewStatus,
      revision: issue.revision,
      status: command.values.status ?? issue.status,
    });
    io.output(
      command.json
        ? JSON.stringify(summarize(updated), null, 2)
        : `updated #${updated.id}: ${updated.status}, ${updated.priority}, ${updated.reviewStatus}`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CliArgumentError || error instanceof IssueStoreError) {
      io.error(error.message);
      return 1;
    }
    throw error;
  }
};

if (import.meta.main) {
  const exitCode = await runIssueCli(
    Bun.argv.slice(2),
    join(import.meta.dir, '..', '..', '..', 'issues'),
    {
      error: (value) => console.error(value),
      output: (value) => console.log(value),
    },
  );
  process.exitCode = exitCode;
}
