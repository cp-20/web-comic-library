'use client';

import { useEffect, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type Follow = Readonly<{
  followerUserUuid: string;
  followedUserUuid: string;
  status: 'accepted' | 'pending' | 'rejected';
}>;

export const UserFollowList = () => {
  const [followers, setFollowers] = useState<readonly Follow[]>([]);
  const [following, setFollowing] = useState<readonly Follow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const response = await client.api.settings.follows.users.$get();
    if (!response.ok) {
      setMessage('follow一覧を取得できませんでした。');
      return;
    }
    const value = await response.json();
    setFollowers(value.followers);
    setFollowing(value.following);
  };

  useEffect(() => {
    void load();
  }, []);

  const respond = async (userId: string, response: 'accepted' | 'rejected'): Promise<void> => {
    const result = await client.api.settings['follow-requests'][':userId'].$post({
      json: { response },
      param: { userId },
    });
    setMessage(result.ok ? 'follow申請を更新しました。' : 'follow申請を更新できませんでした。');
    if (result.ok) await load();
  };

  return (
    <section aria-labelledby="follow-list-heading" aria-live="polite" className="grid gap-6">
      <h2 className="text-lg font-semibold" id="follow-list-heading">
        follow申請とfollow一覧
      </h2>
      <div className="grid gap-3">
        <h3 className="font-medium">受け取った申請</h3>
        {followers.length === 0 ? (
          <p className="text-sm text-text-muted">現在、受け取ったfollow申請はありません。</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {followers.map((follow) => (
              <li className="grid gap-2 py-4" key={follow.followerUserUuid}>
                <p className="break-all text-sm">
                  <span className="font-mono">{follow.followerUserUuid}</span>
                  <span className="text-text-muted"> / {follow.status}</span>
                </p>
                {follow.status === 'pending' ? (
                  <div className="flex gap-3">
                    <Button
                      onClick={() => void respond(follow.followerUserUuid, 'accepted')}
                      type="button"
                      variant="secondary"
                    >
                      承認
                    </Button>
                    <Button
                      onClick={() => void respond(follow.followerUserUuid, 'rejected')}
                      type="button"
                      variant="ghost"
                    >
                      拒否
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-3">
        <h3 className="font-medium">自分がfollowしている利用者</h3>
        {following.length === 0 ? (
          <p className="text-sm text-text-muted">現在、followしている利用者はいません。</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {following.map((follow) => (
              <li className="py-4" key={follow.followedUserUuid}>
                <p className="break-all text-sm">
                  <span className="font-mono">{follow.followedUserUuid}</span>
                  <span className="text-text-muted"> / {follow.status}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-text-muted">{message}</p>
    </section>
  );
};
