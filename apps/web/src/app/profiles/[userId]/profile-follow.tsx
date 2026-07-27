'use client';

import { useEffect, useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const ProfileFollow = ({ userId }: Readonly<{ userId: string }>) => {
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Readonly<{ displayName: string; userId: string }> | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const response = await client.api.profiles[':userId'].$get({ param: { userId } });
      if (!response.ok) {
        setMessage('プロフィールを表示できません。');
        return;
      }
      setProfile(await response.json());
    })();
  }, [userId]);

  return (
    <section aria-live="polite">
      <h1>{profile?.displayName ?? userId}</h1>
      <button
        onClick={async () => {
          const response = await client.api.profiles[':userId'].follow.$post({ param: { userId } });
          if (!response.ok) {
            setMessage('followできませんでした。');
            return;
          }
          const follow = await response.json();
          setMessage(follow.status === 'accepted' ? 'followしました。' : 'followを申請しました。');
        }}
        type="button"
      >
        followする
      </button>
      <button
        onClick={async () => {
          const response = await client.api.profiles[':userId'].follow.$delete({
            param: { userId },
          });
          setMessage(response.ok ? 'followを解除しました。' : 'followを解除できませんでした。');
        }}
        type="button"
      >
        followを解除
      </button>
      <p>{message}</p>
    </section>
  );
};
