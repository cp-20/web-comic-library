'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Checkbox } from '../../../../../components/ui/checkbox';
import { Field } from '../../../../../components/ui/field';
import { Select } from '../../../../../components/ui/select';
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

  if (!view)
    return (
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    );
  const expired = new Date(view.batch.expiresAt).getTime() <= Date.now();
  const closed = expired || view.batch.confirmedAt !== null || view.batch.discardedAt !== null;

  return (
    <section aria-labelledby="favorite-import-candidates" className="grid gap-6">
      <div className="grid gap-1">
        <p aria-live="polite" className="text-sm text-text-muted">
          {message}
        </p>
        <p className="text-sm text-text-muted">
          有効期限: {new Date(view.batch.expiresAt).toLocaleString()}
        </p>
      </div>
      <fieldset
        className="grid max-w-lg gap-4 rounded-panel border border-border-subtle px-4 pb-4"
        disabled={closed}
      >
        <legend className="px-1 font-medium">一括設定</legend>
        <Field id="import-follow-mode" label="follow方式">
          <Select
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
          </Select>
        </Field>
        <Field id="import-reading-status" label="読書状態">
          <Select
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
          </Select>
        </Field>
      </fieldset>
      <h2 className="text-lg font-semibold" id="favorite-import-candidates">
        候補
      </h2>
      <ul className="divide-y divide-border-subtle">
        {view.candidates.map((candidate) => {
          const selectable = candidate.matchKind === 'exact';
          const override = overrides[candidate.id];
          return (
            <li className="grid gap-3 py-6" key={candidate.id}>
              <p className="flex flex-wrap items-center gap-2">
                <strong className="font-medium">{candidate.title}</strong>
                <Badge variant={candidate.matchKind === 'exact' ? 'success' : 'warning'}>
                  {matchLabel(candidate.matchKind)}
                </Badge>
              </p>
              <p className="break-all text-sm text-text-muted">{candidate.canonicalUrl}</p>
              {candidate.matchKind === 'ambiguous' ? (
                <p className="text-sm text-text-muted">
                  候補作品数: {candidate.alternativeWorkIds.length}
                </p>
              ) : null}
              {candidate.matchKind === 'unmatched' && candidate.titleMatchWorkIds.length > 0 ? (
                <p className="text-sm text-text-muted">
                  同名候補作品数: {candidate.titleMatchWorkIds.length}（自動確定しません）
                </p>
              ) : null}
              {selectable ? (
                <fieldset className="grid gap-3" disabled={closed}>
                  <Checkbox
                    checked={selectedSet.has(candidate.id)}
                    label="この作品を取り込む"
                    onChange={(event) => setCandidateSelected(candidate.id, event.target.checked)}
                  />
                  <div className="max-w-xs">
                    <Field id={`override-reading-status-${candidate.id}`} label="個別の読書状態">
                      <Select
                        id={`override-reading-status-${candidate.id}`}
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
                      </Select>
                    </Field>
                  </div>
                  <div className="max-w-xs">
                    <Field id={`override-follow-mode-${candidate.id}`} label="個別のfollow方式">
                      <Select
                        id={`override-follow-mode-${candidate.id}`}
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
                      </Select>
                    </Field>
                  </div>
                </fieldset>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
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
        </Button>
        <Button
          disabled={closed}
          onClick={async () => {
            const response = await client.api['favorite-imports'][':batchId'].discard.$post({
              param: { batchId },
            });
            setMessage(response.ok ? 'import batchを破棄しました。' : '破棄できませんでした。');
          }}
          type="button"
          variant="ghost"
        >
          破棄
        </Button>
      </div>
    </section>
  );
};
