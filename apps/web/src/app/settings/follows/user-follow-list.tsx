'use client';

import { useEffect, useState } from 'react';

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
    <section aria-live="polite">
      <h2>follow申請とfollow一覧</h2>
      <h3>受け取った申請</h3>
      <ul>
        {followers.map((follow) => (
          <li key={follow.followerUserUuid}>
            {follow.followerUserUuid} / {follow.status}
            {follow.status === 'pending' ? (
              <>
                <button
                  onClick={() => void respond(follow.followerUserUuid, 'accepted')}
                  type="button"
                >
                  承認
                </button>
                <button
                  onClick={() => void respond(follow.followerUserUuid, 'rejected')}
                  type="button"
                >
                  拒否
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <h3>自分がfollowしている利用者</h3>
      <ul>
        {following.map((follow) => (
          <li key={follow.followedUserUuid}>
            {follow.followedUserUuid} / {follow.status}
          </li>
        ))}
      </ul>
      <p>{message}</p>
    </section>
  );
};
