'use client';

import { useEffect, useMemo, useState } from 'react';

import { createApiClient } from '../../../../../lib/api-client';

const client = createApiClient('');

type MatchKind = 'exact' | 'ambiguous' | 'unmatched';
type FollowMode = 'fastest' | 'source_priority' | 'selected_publications' | 'all_publications';
type ReadingStatus = 'want_to_read' | 'reading' | 'paused' | 'dropped' | 'completed';
type FavoriteImportView = Readonly<{
  batch: Readonly<{ confirmedAt: string | null; discardedAt: string | null; expiresAt: string }>;
  candidates: readonly Readonly<{
    alternativeWorkIds: readonly string[];
    canonicalUrl: string;
    id: string;
    matchKind: MatchKind;
    title: string;
    titleMatchWorkIds: readonly string[];
  }>[];
}>;
type CandidateOverride = Readonly<{
  followMode?: FollowMode | undefined;
  readingStatus?: ReadingStatus | null | undefined;
}>;

const isFollowMode = (value: string): value is FollowMode =>
  value === 'fastest' ||
  value === 'source_priority' ||
  value === 'selected_publications' ||
  value === 'all_publications';

const isReadingStatus = (value: string): value is ReadingStatus =>
  value === 'want_to_read' ||
  value === 'reading' ||
  value === 'paused' ||
  value === 'dropped' ||
  value === 'completed';

const matchLabel = (kind: MatchKind): string => {
  if (kind === 'exact') return '照合済み';
  if (kind === 'ambiguous') return '複数候補';
  return '未照合';
};

export const FavoriteImportConfirmation = ({ batchId }: Readonly<{ batchId: string }>) => {
  const [view, setView] = useState<FavoriteImportView | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [defaults, setDefaults] = useState<{
    followMode: FollowMode;
    readingStatus: ReadingStatus | null;
  }>({ followMode: 'all_publications', readingStatus: null });
  const [overrides, setOverrides] = useState<Readonly<Record<string, CandidateOverride>>>({});
  const [message, setMessage] = useState('読み込み中です。');

  useEffect(() => {
    void (async () => {
      const response = await client.api['favorite-imports'][':batchId'].$get({
        param: { batchId },
      });
      if (!response.ok) {
        setMessage(
          response.status === 404 ? 'このimport batchは利用できません。' : '読み込めませんでした。',
        );
        return;
      }
      const imported = await response.json();
      setView(imported);
      setSelected(
        imported.candidates
          .filter((candidate) => candidate.matchKind === 'exact')
          .map((candidate) => candidate.id),
      );
      setMessage('照合済みの作品を確認して取り込みます。');
    })();
  }, [batchId]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const setCandidateSelected = (candidateId: string, checked: boolean): void => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, candidateId])]
        : current.filter((id) => id !== candidateId),
    );
  };
  const updateOverride = (candidateId: string, value: CandidateOverride): void => {
    setOverrides((current) => ({
      ...current,
      [candidateId]: { ...current[candidateId], ...value },
    }));
  };

  if (!view) return <p aria-live="polite">{message}</p>;
  const expired = new Date(view.batch.expiresAt).getTime() <= Date.now();
  const closed = expired || view.batch.confirmedAt !== null || view.batch.discardedAt !== null;

  return (
    <section aria-labelledby="favorite-import-candidates">
      <p aria-live="polite">{message}</p>
      <p>有効期限: {new Date(view.batch.expiresAt).toLocaleString()}</p>
      <fieldset disabled={closed}>
        <legend>一括設定</legend>
        <label htmlFor="import-follow-mode">follow方式</label>
        <select
          id="import-follow-mode"
          onChange={(event) => {
            const followMode = event.target.value;
            if (isFollowMode(followMode)) setDefaults((current) => ({ ...current, followMode }));
          }}
          value={defaults.followMode}
        >
          <option value="all_publications">全掲載先を個別に通知</option>
          <option value="fastest">最速の掲載を一度だけ通知</option>
          <option value="source_priority">掲載先の優先順位で通知</option>
          <option value="selected_publications">このお気に入り掲載先だけ通知</option>
        </select>
        <label htmlFor="import-reading-status">読書状態</label>
        <select
          id="import-reading-status"
          onChange={(event) => {
            const readingStatus = event.target.value;
            if (!readingStatus || isReadingStatus(readingStatus)) {
              setDefaults((current) => ({
                ...current,
                readingStatus: isReadingStatus(readingStatus) ? readingStatus : null,
              }));
            }
          }}
          value={defaults.readingStatus ?? ''}
        >
          <option value="">followだけ（読書状態を登録しない）</option>
          <option value="want_to_read">読みたい</option>
          <option value="reading">読んでいる</option>
        </select>
      </fieldset>
      <h2 id="favorite-import-candidates">候補</h2>
      <ul>
        {view.candidates.map((candidate) => {
          const selectable = candidate.matchKind === 'exact';
          const override = overrides[candidate.id];
          return (
            <li key={candidate.id}>
              <strong>{candidate.title}</strong> — {matchLabel(candidate.matchKind)}
              <p>{candidate.canonicalUrl}</p>
              {candidate.matchKind === 'ambiguous' ? (
                <p>候補作品数: {candidate.alternativeWorkIds.length}</p>
              ) : null}
              {candidate.matchKind === 'unmatched' && candidate.titleMatchWorkIds.length > 0 ? (
                <p>同名候補作品数: {candidate.titleMatchWorkIds.length}（自動確定しません）</p>
              ) : null}
              {selectable ? (
                <fieldset disabled={closed}>
                  <label>
                    <input
                      checked={selectedSet.has(candidate.id)}
                      onChange={(event) => setCandidateSelected(candidate.id, event.target.checked)}
                      type="checkbox"
                    />
                    この作品を取り込む
                  </label>
                  <label>
                    個別の読書状態
                    <select
                      onChange={(event) => {
                        const readingStatus = event.target.value;
                        if (!readingStatus || isReadingStatus(readingStatus)) {
                          updateOverride(candidate.id, {
                            readingStatus: isReadingStatus(readingStatus)
                              ? readingStatus
                              : undefined,
                          });
                        }
                      }}
                      value={override?.readingStatus ?? ''}
                    >
                      <option value="">一括設定を使う</option>
                      <option value="want_to_read">読みたい</option>
                      <option value="reading">読んでいる</option>
                    </select>
                  </label>
                  <label>
                    個別のfollow方式
                    <select
                      onChange={(event) => {
                        const followMode = event.target.value;
                        if (!followMode || isFollowMode(followMode)) {
                          updateOverride(candidate.id, {
                            followMode: isFollowMode(followMode) ? followMode : undefined,
                          });
                        }
                      }}
                      value={override?.followMode ?? ''}
                    >
                      <option value="">一括設定を使う</option>
                      <option value="all_publications">全掲載先</option>
                      <option value="fastest">最速</option>
                      <option value="source_priority">掲載先優先</option>
                      <option value="selected_publications">この掲載先だけ</option>
                    </select>
                  </label>
                </fieldset>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button
        disabled={closed}
        onClick={async () => {
          const response = await client.api['favorite-imports'][':batchId'].apply.$post({
            json: {
              defaults,
              selections: selected.map((candidateId) => {
                const override = overrides[candidateId];
                return {
                  candidateId,
                  followMode: override?.followMode,
                  readingStatus: override?.readingStatus,
                };
              }),
            },
            param: { batchId },
          });
          setMessage(
            response.ok
              ? '取り込みました。既読と読書進捗は変更していません。'
              : '取り込めませんでした。',
          );
        }}
        type="button"
      >
        選択した作品を取り込む
      </button>
      <button
        disabled={closed}
        onClick={async () => {
          const response = await client.api['favorite-imports'][':batchId'].discard.$post({
            param: { batchId },
          });
          setMessage(response.ok ? 'import batchを破棄しました。' : '破棄できませんでした。');
        }}
        type="button"
      >
        破棄
      </button>
    </section>
  );
};
