'use client';

import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

type Activity = Readonly<{
  createdAt: string;
  id: string;
  kind: 'completed' | 'reading_status';
  status: string;
  userUuid: string;
  workId: string;
}>;

const emptyMessage = '表示できる活動はありません。';

export const TimelineList = () => {
  const [activities, setActivities] = useState<readonly Activity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (nextCursor: string | null): Promise<void> => {
    const response = await client.api.timeline.$get({
      query: nextCursor ? { cursor: nextCursor } : {},
    });
    if (!response.ok) {
      setMessage('timelineを取得できませんでした。');
      return;
    }
    const page = await response.json();
    setActivities((current) => (nextCursor ? [...current, ...page.items] : page.items));
    setCursor(page.nextCursor);
    setMessage(page.items.length === 0 && !nextCursor ? emptyMessage : null);
  };

  useEffect(() => {
    void load(null);
  }, []);

  return (
    <section aria-live="polite" className="grid gap-4">
      {activities.length === 0 && message === emptyMessage ? (
        <EmptyState
          description="follow中の利用者の公開activityがまだありません。"
          title={emptyMessage}
        />
      ) : null}
      {activities.length === 0 ? null : (
        <ul className="divide-y divide-border-subtle">
          {activities.map((activity) => (
            <li className="grid gap-0.5 py-4" key={activity.id}>
              <p className="font-medium">
                {activity.kind === 'completed' ? '読了' : '読書状態変更'} / {activity.status}
              </p>
              <time className="text-sm text-text-muted" dateTime={activity.createdAt}>
                {new Date(activity.createdAt).toLocaleString('ja-JP')}
              </time>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <Button
          className="justify-self-center"
          onClick={() => void load(cursor)}
          type="button"
          variant="secondary"
        >
          さらに表示
        </Button>
      ) : null}
      {message && message !== emptyMessage ? (
        <p className="text-sm text-danger">{message}</p>
      ) : null}
    </section>
  );
};
