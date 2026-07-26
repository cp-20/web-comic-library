'use client';

import { useEffect, useState } from 'react';

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
    <section aria-labelledby="volume-records-heading">
      <h2 id="volume-records-heading">巻の記録</h2>
      {records.length === 0 ? (
        <p>保存済みの単行本記録はありません。</p>
      ) : (
        <ul>
          {records.map((record) => (
            <li key={record.volumeEditionId}>
              {record.volumeEditionId} — {record.status} / 紙: {record.ownsPaper ? '所蔵' : 'なし'}{' '}
              / 電子: {record.ownsDigital ? '所蔵' : 'なし'}
              {record.memoContentUnitId ? ` / メモ: ${record.memoContentUnitId}` : ''}
            </li>
          ))}
        </ul>
      )}
      <form
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
        <label htmlFor="volumeEditionId">巻ID</label>
        <input id="volumeEditionId" name="volumeEditionId" required />
        <label htmlFor="volumeStatus">読書状態</label>
        <select defaultValue="unread" id="volumeStatus" name="status">
          <option value="unread">未読</option>
          <option value="reading">読書中</option>
          <option value="read">既読</option>
        </select>
        <label>
          <input name="ownsPaper" type="checkbox" />
          紙を所蔵
        </label>
        <label>
          <input name="ownsDigital" type="checkbox" />
          電子を所蔵
        </label>
        <label htmlFor="memoContentUnitId">この巻で読んだ話のメモ（話ID）</label>
        <input id="memoContentUnitId" name="memoContentUnitId" />
        <label htmlFor="volumeVisibility">記録の公開範囲</label>
        <select defaultValue="private" id="volumeVisibility" name="visibility">
          <option value="private">非公開</option>
          <option value="followers">フォロワー限定</option>
          <option value="public">公開</option>
        </select>
        <button type="submit">巻の記録を保存</button>
      </form>
      <form
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
        <h2>巻と話の対応候補</h2>
        <label htmlFor="correctionVolumeEditionId">巻ID</label>
        <input id="correctionVolumeEditionId" name="volumeEditionId" required />
        <label htmlFor="contentUnitId">話ID</label>
        <input id="contentUnitId" name="contentUnitId" required />
        <label htmlFor="suggestedStatus">候補の状態</label>
        <select defaultValue="confirmed" id="suggestedStatus" name="suggestedStatus">
          <option value="confirmed">確認済みにする</option>
          <option value="unconfirmed">未確認に戻す</option>
          <option value="rejected">対応しない</option>
        </select>
        <label htmlFor="rationale">確認根拠</label>
        <textarea id="rationale" name="rationale" required />
        <button type="submit">対応候補を送る</button>
      </form>
      <p aria-live="polite">{message}</p>
    </section>
  );
};
