'use client';

import { useEffect, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Textarea } from '../../../components/ui/textarea';
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
    <section aria-live="polite" className="grid gap-6">
      <h1 className="text-2xl font-semibold">{profile?.displayName ?? userId}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={async () => {
            const response = await client.api.profiles[':userId'].follow.$post({
              param: { userId },
            });
            if (!response.ok) {
              setMessage('followできませんでした。');
              return;
            }
            const follow = await response.json();
            setMessage(
              follow.status === 'accepted' ? 'followしました。' : 'followを申請しました。',
            );
          }}
          type="button"
        >
          followする
        </Button>
        <Button
          onClick={async () => {
            const response = await client.api.profiles[':userId'].follow.$delete({
              param: { userId },
            });
            setMessage(response.ok ? 'followを解除しました。' : 'followを解除できませんでした。');
          }}
          type="button"
          variant="secondary"
        >
          followを解除
        </Button>
        <Button
          onClick={() => {
            void (async () => {
              const response = await client.api.profiles[':userId'].mute.$post({
                param: { userId },
              });
              setMessage(response.ok ? 'muteしました。' : 'muteできませんでした。');
            })();
          }}
          type="button"
          variant="secondary"
        >
          muteする
        </Button>
        <Button
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
          variant="danger"
        >
          blockする
        </Button>
      </div>
      <form
        className="grid max-w-2xl gap-4"
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
        <Field id="profile-report-reason" label="通報理由">
          <Textarea id="profile-report-reason" maxLength={2_000} name="reason" required />
        </Field>
        <div>
          <Button type="submit" variant="secondary">
            プロフィールを通報する
          </Button>
        </div>
      </form>
      <p className="text-sm text-text-muted">{message}</p>
    </section>
  );
};
