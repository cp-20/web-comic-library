'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { createApiClient } from '../../../lib/api-client';

type Action = 'hide' | 'restore' | 'suspend' | 'warn';
type TargetKind = 'activity' | 'profile';
type Report = Readonly<{
  id: string;
  reason: string;
  status: 'dismissed' | 'open' | 'resolved' | 'reviewing';
  targetId: string;
  targetKind: 'activity' | 'profile' | 'reaction';
}>;

const client = createApiClient('');
const urlPattern = /(https?:\/\/[^\s]+)/gu;

const linkify = (value: string): readonly ReactNode[] =>
  value.split(urlPattern).map((part) =>
    /^https?:\/\//u.test(part) ? (
      <a href={part} key={part} rel="nofollow ugc noopener" target="_blank">
        {part}
      </a>
    ) : (
      part
    ),
  );

const actionFrom = (value: FormDataEntryValue | null): Action | null => {
  switch (value) {
    case 'hide':
    case 'restore':
    case 'suspend':
    case 'warn':
      return value;
    default:
      return null;
  }
};

const targetKindFrom = (value: FormDataEntryValue | null): TargetKind | null => {
  return value === 'activity' || value === 'profile' ? value : null;
};

export default function ModerationPage() {
  const [message, setMessage] = useState('通報queueを読み込み中です。');
  const [reports, setReports] = useState<readonly Report[]>([]);

  const loadReports = async (): Promise<void> => {
    try {
      const response = await client.api.admin.moderation.reports.$get({ query: {} });
      if (!response.ok) {
        setMessage(`通報queueを取得できませんでした (${response.status})。`);
        return;
      }
      const payload: Readonly<{ items: readonly Report[] }> = await response.json();
      setReports(payload.items);
      setMessage(`${payload.items.length}件の通報を表示しています。`);
    } catch {
      setMessage('接続に失敗しました。認証状態とネットワークを確認してください。');
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const reportId = String(form.get('reportId') ?? '');
    const action = actionFrom(form.get('action'));
    const targetKind = targetKindFrom(form.get('targetKind'));
    if (!action || !targetKind || !reportId) {
      setMessage('操作内容を確認してください。');
      return;
    }
    try {
      const response = await client.api.admin.moderation.reports[':id'].actions.$post({
        json: {
          action,
          reason: String(form.get('reason') ?? ''),
          targetId: String(form.get('targetId') ?? ''),
          targetKind,
        },
        param: { id: reportId },
      });
      if (!response.ok) {
        setMessage(`操作を記録できませんでした (${response.status})。`);
        return;
      }
      formElement.reset();
      await loadReports();
      setMessage('操作と監査記録を保存しました。');
    } catch {
      setMessage('接続に失敗しました。認証状態とネットワークを確認してください。');
    }
  };

  return (
    <main>
      <h1>moderation管理</h1>
      <p aria-live="polite">{message}</p>
      <button onClick={() => void loadReports()} type="button">
        queueを更新する
      </button>

      <section aria-labelledby="moderation-queue-heading">
        <h2 id="moderation-queue-heading">通報queue</h2>
        {reports.length === 0 ? (
          <p>表示可能な通報はありません。</p>
        ) : (
          <ul>
            {reports.map((report) => (
              <li key={report.id}>
                <p>
                  {report.targetKind} / {report.targetId} / {report.status}
                </p>
                <p>{linkify(report.reason)}</p>
                <p>通報ID: {report.id}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="moderation-action-heading">
        <h2 id="moderation-action-heading">処理を記録する</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="moderation-report-id">通報ID</label>
          <input id="moderation-report-id" name="reportId" required />
          <label htmlFor="moderation-action">操作</label>
          <select defaultValue="hide" id="moderation-action" name="action">
            <option value="hide">非表示</option>
            <option value="warn">警告</option>
            <option value="suspend">利用停止</option>
            <option value="restore">解除</option>
          </select>
          <label htmlFor="moderation-target-kind">対象種別</label>
          <select defaultValue="activity" id="moderation-target-kind" name="targetKind">
            <option value="activity">activity</option>
            <option value="profile">profile</option>
          </select>
          <label htmlFor="moderation-target-id">対象ID</label>
          <input id="moderation-target-id" name="targetId" required />
          <label htmlFor="moderation-reason">理由</label>
          <textarea id="moderation-reason" maxLength={2_000} name="reason" required />
          <button type="submit">操作を保存する</button>
        </form>
      </section>
    </main>
  );
}
