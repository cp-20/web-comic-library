'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type Activity = Readonly<{
  createdAt: string;
  kind: 'completed' | 'reading_status' | 'review';
  status: string | null;
  userId: string;
  userName: string;
  workId: string;
  workTitle: string;
}>;

export const ActivityDetails = ({ activityId }: Readonly<{ activityId: string }>) => {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void client.api.activities[':id'].share
      .$get({ param: { id: activityId } })
      .then(async (response) => {
        if (!response.ok) {
          setError(true);
          return;
        }
        setActivity((await response.json()).activity);
      })
      .catch(() => setError(true));
  }, [activityId]);

  if (error) return <p className="text-text-muted">公開記録が見つかりません。</p>;
  if (!activity) return <p className="text-text-muted">公開記録を読み込んでいます。</p>;
  return (
    <article className="grid gap-2">
      <h1 className="text-2xl font-semibold">
        {activity.kind === 'completed'
          ? '読了記録'
          : activity.kind === 'review'
            ? 'レビュー'
            : '読書状態変更'}
      </h1>
      <p>
        <Link className="text-accent hover:underline" href={`/profiles/${activity.userId}`}>
          {activity.userName}
        </Link>
      </p>
      <p>
        <Link className="text-accent hover:underline" href={`/works/${activity.workId}`}>
          {activity.workTitle}
        </Link>
      </p>
      {activity.status ? <p>状態: {activity.status}</p> : null}
      <time className="text-sm text-text-muted" dateTime={activity.createdAt}>
        {new Date(activity.createdAt).toLocaleString('ja-JP')}
      </time>
    </article>
  );
};
