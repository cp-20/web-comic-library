'use client';

import { useState } from 'react';

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
    <section aria-labelledby="review-controls-heading">
      <h2 id="review-controls-heading">感想</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(event.currentTarget);
        }}
      >
        <label htmlFor="reviewTargetKind">対象</label>
        <select defaultValue="content" id="reviewTargetKind" name="targetKind">
          <option value="content">話</option>
          <option value="volume">巻</option>
        </select>
        <label htmlFor="reviewTargetId">対象ID</label>
        <input id="reviewTargetId" name="targetId" required />
        <button type="submit">感想を表示</button>
      </form>
      <form
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
        <label htmlFor="reviewBody">本文（1,000文字まで）</label>
        <textarea id="reviewBody" maxLength={1_000} name="body" required />
        <label htmlFor="reviewVisibility">公開範囲</label>
        <select defaultValue="public" id="reviewVisibility" name="visibility">
          <option value="public">公開</option>
          <option value="followers">フォロワー限定</option>
          <option value="private">非公開</option>
        </select>
        <label>
          <input name="spoiler" type="checkbox" />
          ネタバレを含む
        </label>
        <button type="submit">感想を投稿</button>
      </form>
      {reviews.length === 0 ? (
        <p>対象を指定して感想を表示してください。</p>
      ) : (
        <ul>
          {reviews.map((review) => (
            <li key={review.id}>
              {review.state === 'visible' ? (
                <p>{revealedBodies[review.id] ?? review.body}</p>
              ) : (
                <>
                  <p>この感想はネタバレを含む可能性があるため伏せられています。</p>
                  <button
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
                  >
                    本文を表示する
                  </button>
                </>
              )}
              <p>{review.spoiler ? '投稿者がネタバレを指定' : 'ネタバレ指定なし'}</p>
              <button
                onClick={() => {
                  void client.api.reviews[':id'].reactions.$post({ param: { id: review.id } });
                }}
                type="button"
              >
                いいね（{review.reactionCount}）
              </button>
              <form
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
                <label htmlFor={`review-report-reason-${review.id}`}>通報理由</label>
                <textarea
                  id={`review-report-reason-${review.id}`}
                  maxLength={2_000}
                  name="reason"
                  required
                />
                <button type="submit">感想を通報する</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite">{message}</p>
    </section>
  );
};
