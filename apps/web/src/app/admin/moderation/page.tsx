'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { PageHeader } from '../../../components/ui/page-header';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
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
      <a
        className="break-all text-accent underline"
        href={part}
        key={part}
        rel="nofollow ugc noopener"
        target="_blank"
      >
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
    <div className="grid gap-8">
      <PageHeader
        description="通報queueを確認し、操作と理由を記録します。"
        title="moderation管理"
      />
      <p
        aria-live="polite"
        className="rounded-panel border border-border-subtle bg-surface px-4 py-3"
      >
        {message}
      </p>
      <div>
        <Button onClick={() => void loadReports()} type="button" variant="secondary">
          queueを更新する
        </Button>
      </div>

      <section aria-labelledby="moderation-queue-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="moderation-queue-heading">
          通報queue
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-text-muted">表示可能な通報はありません。</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {reports.map((report) => (
              <li className="grid gap-1 py-4" key={report.id}>
                <p className="font-medium">
                  {report.targetKind} / {report.targetId} / {report.status}
                </p>
                <p>{linkify(report.reason)}</p>
                <p className="text-sm tabular-nums text-text-muted">通報ID: {report.id}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="moderation-action-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="moderation-action-heading">
          処理を記録する
        </h2>
        <form className="grid max-w-2xl gap-4" onSubmit={(event) => void submit(event)}>
          <Field id="moderation-report-id" label="通報ID">
            <Input id="moderation-report-id" name="reportId" required />
          </Field>
          <Field id="moderation-action" label="操作">
            <Select defaultValue="hide" id="moderation-action" name="action">
              <option value="hide">非表示</option>
              <option value="warn">警告</option>
              <option value="suspend">利用停止</option>
              <option value="restore">解除</option>
            </Select>
          </Field>
          <Field id="moderation-target-kind" label="対象種別">
            <Select defaultValue="activity" id="moderation-target-kind" name="targetKind">
              <option value="activity">activity</option>
              <option value="profile">profile</option>
            </Select>
          </Field>
          <Field id="moderation-target-id" label="対象ID">
            <Input id="moderation-target-id" name="targetId" required />
          </Field>
          <Field id="moderation-reason" label="理由">
            <Textarea id="moderation-reason" maxLength={2_000} name="reason" required />
          </Field>
          <div>
            <Button type="submit">操作を保存する</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
