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
      <button
        onClick={() => {
          void (async () => {
            const response = await client.api.profiles[':userId'].mute.$post({ param: { userId } });
            setMessage(response.ok ? 'muteしました。' : 'muteできませんでした。');
          })();
        }}
        type="button"
      >
        muteする
      </button>
      <button
        onClick={() => {
          void (async () => {
            const response = await client.api.profiles[':userId'].block.$post({
              param: { userId },
            });
            setMessage(
              response.ok
                ? 'blockしました。相互のfollow申請も解除されます。'
                : 'blockできませんでした。',
            );
          })();
        }}
        type="button"
      >
        blockする
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
          void (async () => {
            const response = await client.api.reports.$post({
              json: { reason, targetId: userId, targetKind: 'profile' },
            });
            setMessage(response.ok ? '通報を受け付けました。' : '通報を送信できませんでした。');
          })();
        }}
      >
        <label htmlFor="profile-report-reason">通報理由</label>
        <textarea id="profile-report-reason" maxLength={2_000} name="reason" required />
        <button type="submit">プロフィールを通報する</button>
      </form>
      <p>{message}</p>
    </section>
  );
};
