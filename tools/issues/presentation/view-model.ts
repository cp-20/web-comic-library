import {
  issueExecutions,
  issuePriorities,
  issueReviewStatuses,
  issueStatuses,
  type IssueRecord,
} from '../storage/issue-store';

export type IssueSummary = Omit<IssueRecord, 'body' | 'revision'>;

export type IssueDetail = IssueRecord &
  Readonly<{
    bodyHtml: string;
  }>;

export type IssueListResponse = Readonly<{
  issues: readonly IssueSummary[];
  options: Readonly<{
    executions: typeof issueExecutions;
    priorities: typeof issuePriorities;
    reviewStatuses: typeof issueReviewStatuses;
    statuses: typeof issueStatuses;
  }>;
}>;

const summarize = ({ body: _body, revision: _revision, ...summary }: IssueRecord): IssueSummary =>
  summary;

export const createIssueListResponse = (issues: readonly IssueRecord[]): IssueListResponse => ({
  issues: issues.map(summarize),
  options: {
    executions: issueExecutions,
    priorities: issuePriorities,
    reviewStatuses: issueReviewStatuses,
    statuses: issueStatuses,
  },
});
