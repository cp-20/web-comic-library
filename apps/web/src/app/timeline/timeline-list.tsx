'use client';

import { useEffect, useState } from 'react';

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
    setMessage(page.items.length === 0 && !nextCursor ? '表示できる活動はありません。' : null);
  };

  useEffect(() => {
    void load(null);
  }, []);

  return (
    <section aria-live="polite">
      <ul>
        {activities.map((activity) => (
          <li key={activity.id}>
            {activity.kind === 'completed' ? '読了' : '読書状態変更'} / {activity.status} /{' '}
            <time dateTime={activity.createdAt}>
              {new Date(activity.createdAt).toLocaleString('ja-JP')}
            </time>
          </li>
        ))}
      </ul>
      {cursor ? (
        <button onClick={() => void load(cursor)} type="button">
          さらに表示
        </button>
      ) : null}
      <p>{message}</p>
    </section>
  );
};
