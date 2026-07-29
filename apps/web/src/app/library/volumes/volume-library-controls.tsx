'use client';

import { useEffect, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type VolumeStatus = 'unread' | 'reading' | 'read';
type Visibility = 'public' | 'followers' | 'private';
type MappingStatus = 'confirmed' | 'unconfirmed' | 'rejected';

type VolumeRecord = Readonly<{
  memoContentUnitId: string | null;
  ownsDigital: boolean;
  ownsPaper: boolean;
  status: VolumeStatus;
  volumeEditionId: string;
}>;

const isVolumeStatus = (value: string): value is VolumeStatus =>
  value === 'unread' || value === 'reading' || value === 'read';

const isVisibility = (value: string): value is Visibility =>
  value === 'public' || value === 'followers' || value === 'private';

const isMappingStatus = (value: string): value is MappingStatus =>
  value === 'confirmed' || value === 'unconfirmed' || value === 'rejected';

const volumeStatusLabels: Record<VolumeStatus, string> = {
  read: '既読',
  reading: '読書中',
  unread: '未読',
};

const volumeStatusBadgeVariants = {
  read: 'success',
  reading: 'accent',
  unread: 'neutral',
} as const;

export const VolumeLibraryControls = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<readonly VolumeRecord[]>([]);

  const refresh = async (): Promise<void> => {
    const response = await client.api.library.volumes.$get();
    if (!response.ok) {
      setMessage('単行本の記録を取得できませんでした。');
      return;
    }
    setRecords((await response.json()).records);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="grid gap-10">
      <section aria-labelledby="volume-records-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="volume-records-heading">
          巻の記録
        </h2>
        {records.length === 0 ? (
          <EmptyState
            description="巻を保存すると、読書状態と所蔵形態がここに表示されます。"
            title="保存済みの単行本記録はありません。"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {records.map((record) => (
              <li className="grid gap-1 py-4" key={record.volumeEditionId}>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{record.volumeEditionId}</span>
                  <Badge variant={volumeStatusBadgeVariants[record.status]}>
                    {volumeStatusLabels[record.status]}
                  </Badge>
                </p>
                <p className="text-sm text-text-muted">
                  紙: {record.ownsPaper ? '所蔵' : 'なし'} / 電子:{' '}
                  {record.ownsDigital ? '所蔵' : 'なし'}
                  {record.memoContentUnitId ? ` / メモ: ${record.memoContentUnitId}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="volume-record-form-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="volume-record-form-heading">
          巻の記録を登録
        </h2>
        <form
          className="grid gap-4 md:max-w-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const status = String(form.get('status'));
            const visibility = String(form.get('visibility'));
            const memoContentUnitId = String(form.get('memoContentUnitId') ?? '').trim();
            if (!isVolumeStatus(status) || !isVisibility(visibility)) return;
            const response = await client.api.library.volumes.records.$put({
              json: {
                memoContentUnitId: memoContentUnitId || null,
                ownsDigital: form.get('ownsDigital') === 'on',
                ownsPaper: form.get('ownsPaper') === 'on',
                status,
                visibility,
                volumeEditionId: String(form.get('volumeEditionId') ?? ''),
              },
            });
            setMessage(
              response.ok ? '単行本の記録を保存しました。' : '単行本の記録を保存できませんでした。',
            );
            if (response.ok) await refresh();
          }}
        >
          <Field id="volumeEditionId" label="巻ID">
            <Input id="volumeEditionId" name="volumeEditionId" required />
          </Field>
          <Field id="volumeStatus" label="読書状態">
            <Select defaultValue="unread" id="volumeStatus" name="status">
              <option value="unread">未読</option>
              <option value="reading">読書中</option>
              <option value="read">既読</option>
            </Select>
          </Field>
          <div className="grid gap-1">
            <Checkbox label="紙を所蔵" name="ownsPaper" />
            <Checkbox label="電子を所蔵" name="ownsDigital" />
          </div>
          <Field id="memoContentUnitId" label="この巻で読んだ話のメモ（話ID）">
            <Input id="memoContentUnitId" name="memoContentUnitId" />
          </Field>
          <Field id="volumeVisibility" label="記録の公開範囲">
            <Select defaultValue="private" id="volumeVisibility" name="visibility">
              <option value="private">非公開</option>
              <option value="followers">フォロワー限定</option>
              <option value="public">公開</option>
            </Select>
          </Field>
          <Button className="justify-self-start" type="submit">
            巻の記録を保存
          </Button>
        </form>
      </section>
      <section aria-labelledby="mapping-corrections-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold" id="mapping-corrections-heading">
            巻と話の対応候補
          </h2>
          <p className="text-sm text-text-muted">
            確認した巻と話の対応を管理queueへ送ります。確認前に公開catalogは変更されません。
          </p>
        </div>
        <form
          className="grid gap-4 md:max-w-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const suggestedStatus = String(form.get('suggestedStatus'));
            if (!isMappingStatus(suggestedStatus)) return;
            const response = await client.api.library.volumes['mapping-corrections'].$post({
              json: {
                contentUnitId: String(form.get('contentUnitId') ?? ''),
                rationale: String(form.get('rationale') ?? ''),
                suggestedStatus,
                volumeEditionId: String(form.get('volumeEditionId') ?? ''),
              },
            });
            setMessage(
              response.ok ? '対応候補を管理queueへ送りました。' : '対応候補を送れませんでした。',
            );
          }}
        >
          <Field id="correctionVolumeEditionId" label="巻ID">
            <Input id="correctionVolumeEditionId" name="volumeEditionId" required />
          </Field>
          <Field id="contentUnitId" label="話ID">
            <Input id="contentUnitId" name="contentUnitId" required />
          </Field>
          <Field id="suggestedStatus" label="候補の状態">
            <Select defaultValue="confirmed" id="suggestedStatus" name="suggestedStatus">
              <option value="confirmed">確認済みにする</option>
              <option value="unconfirmed">未確認に戻す</option>
              <option value="rejected">対応しない</option>
            </Select>
          </Field>
          <Field id="rationale" label="確認根拠">
            <Textarea id="rationale" name="rationale" required />
          </Field>
          <Button className="justify-self-start" type="submit" variant="secondary">
            対応候補を送る
          </Button>
        </form>
      </section>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </div>
  );
};
