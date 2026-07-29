'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type Review = Readonly<{
  body?: string;
  contentUnitId: string | null;
  createdAt: string;
  id: string;
  reactionCount: number;
  spoiler: boolean;
  state: 'hidden' | 'visible';
  volumeEditionId: string | null;
}>;

const reviewTarget = (form: HTMLFormElement) => {
  const values = new FormData(form);
  const targetId = String(values.get('targetId') ?? '').trim();
  const targetKind = String(values.get('targetKind') ?? 'content');
  return targetKind === 'volume'
    ? { contentUnitId: null, volumeEditionId: targetId }
    : { contentUnitId: targetId, volumeEditionId: null };
};

const isRevealedReview = (value: unknown): value is Readonly<{ body: string }> =>
  typeof value === 'object' && value !== null && 'body' in value && typeof value.body === 'string';

export const ReviewControls = ({ workId }: Readonly<{ workId: string }>) => {
  const [message, setMessage] = useState<string | null>(null);
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [revealedBodies, setRevealedBodies] = useState<Readonly<Record<string, string>>>({});

  const load = async (form: HTMLFormElement): Promise<void> => {
    const selectedTarget = reviewTarget(form);
    const response = await client.api.catalog.works[':workId'].reviews.$get({
      param: { workId },
      query:
        selectedTarget.contentUnitId === null
          ? { volumeEditionId: selectedTarget.volumeEditionId }
          : { contentUnitId: selectedTarget.contentUnitId },
    });
    if (!response.ok) {
      setMessage('感想を取得できませんでした。');
      return;
    }
    const payload: Readonly<{ reviews: readonly Review[] }> = await response.json();
    setReviews(payload.reviews);
    setMessage(`${payload.reviews.length}件の感想を表示しています。`);
  };

  return (
    <section aria-labelledby="review-controls-heading" className="grid gap-6">
      <h2 className="text-lg font-semibold" id="review-controls-heading">
        感想
      </h2>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void load(event.currentTarget);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="reviewTargetKind" label="対象">
            <Select defaultValue="content" id="reviewTargetKind" name="targetKind">
              <option value="content">話</option>
              <option value="volume">巻</option>
            </Select>
          </Field>
          <Field id="reviewTargetId" label="対象ID">
            <Input id="reviewTargetId" name="targetId" required />
          </Field>
        </div>
        <div>
          <Button type="submit">感想を表示</Button>
        </div>
      </form>
      <form
        className="grid gap-4 border-t border-border-subtle pt-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          void (async () => {
            const visibility = String(values.get('visibility') ?? 'public');
            if (visibility !== 'public' && visibility !== 'followers' && visibility !== 'private')
              return;
            const response = await client.api.reviews.$post({
              json: {
                body: String(values.get('body') ?? ''),
                spoiler: values.get('spoiler') === 'on',
                visibility,
                workId,
                ...reviewTarget(form),
              },
            });
            if (!response.ok) {
              setMessage('感想を投稿できませんでした。');
              return;
            }
            form.reset();
            setMessage('感想を投稿しました。');
          })();
        }}
      >
        <Field id="reviewBody" label="本文（1,000文字まで）">
          <Textarea id="reviewBody" maxLength={1_000} name="body" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="reviewVisibility" label="公開範囲">
            <Select defaultValue="public" id="reviewVisibility" name="visibility">
              <option value="public">公開</option>
              <option value="followers">フォロワー限定</option>
              <option value="private">非公開</option>
            </Select>
          </Field>
          <div className="sm:self-end">
            <Checkbox label="ネタバレを含む" name="spoiler" />
          </div>
        </div>
        <div>
          <Button type="submit">感想を投稿</Button>
        </div>
      </form>
      {reviews.length === 0 ? (
        <p className="text-sm text-text-muted">対象を指定して感想を表示してください。</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {reviews.map((review) => (
            <li className="grid gap-3 py-4 first:pt-0 last:pb-0" key={review.id}>
              {review.state === 'visible' ? (
                <p>{revealedBodies[review.id] ?? review.body}</p>
              ) : (
                <div className="grid gap-2 rounded-panel bg-surface-subtle p-4">
                  <p className="text-sm">
                    この感想はネタバレを含む可能性があるため伏せられています。
                  </p>
                  <div>
                    <Button
                      onClick={() => {
                        void (async () => {
                          const response = await client.api.reviews[':id'].reveal.$post({
                            param: { id: review.id },
                          });
                          if (!response.ok) {
                            setMessage('感想を開けませんでした。');
                            return;
                          }
                          const revealed: unknown = await response.json();
                          if (!isRevealedReview(revealed)) {
                            setMessage('感想を開けませんでした。');
                            return;
                          }
                          setRevealedBodies((current) => ({
                            ...current,
                            [review.id]: revealed.body,
                          }));
                          setReviews((current) =>
                            current.map((item) =>
                              item.id === review.id
                                ? { ...item, body: revealed.body, state: 'visible' }
                                : item,
                            ),
                          );
                        })();
                      }}
                      type="button"
                      variant="secondary"
                    >
                      本文を表示する
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-sm text-text-muted">
                {review.spoiler ? '投稿者がネタバレを指定' : 'ネタバレ指定なし'}
              </p>
              <div>
                <Button
                  onClick={() => {
                    void client.api.reviews[':id'].reactions.$post({ param: { id: review.id } });
                  }}
                  type="button"
                  variant="secondary"
                >
                  いいね（{review.reactionCount}）
                </Button>
              </div>
              <form
                className="grid gap-2 border-t border-border-subtle pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
                  void (async () => {
                    const response = await client.api.reports.$post({
                      json: { reason, targetId: review.id, targetKind: 'activity' },
                    });
                    setMessage(
                      response.ok ? '通報を受け付けました。' : '通報を送信できませんでした。',
                    );
                  })();
                }}
              >
                <Field id={`review-report-reason-${review.id}`} label="通報理由">
                  <Textarea
                    id={`review-report-reason-${review.id}`}
                    maxLength={2_000}
                    name="reason"
                    required
                    rows={2}
                  />
                </Field>
                <div>
                  <Button type="submit" variant="ghost">
                    感想を通報する
                  </Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </section>
  );
};
