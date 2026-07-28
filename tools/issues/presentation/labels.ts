import type { IssueStatus } from '../storage/issue-store';

export const issueStatusLabels: Readonly<Record<IssueStatus, string>> = {
  blocked: 'ブロック中',
  done: '完了',
  human_action: '人の対応待ち',
  in_progress: '作業中',
  open: '着手可能',
  review: 'レビュー待ち',
};
