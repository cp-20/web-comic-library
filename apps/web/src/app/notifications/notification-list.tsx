'use client';

import { useEffect, useState } from 'react';

import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

type Notification = Readonly<{
  id: string;
  kind: string;
  readAt: string | null;
}>;

const notificationKinds = [
  'announcement',
  'availability_changed',
  'extra',
  'new_episode',
  'new_volume',
  'republication',
] as const;

type NotificationKind = (typeof notificationKinds)[number];

const isNotificationKind = (value: string): value is NotificationKind =>
  notificationKinds.some((kind) => kind === value);

const defaultNotificationEnabled = (kind: NotificationKind): boolean =>
  kind === 'new_episode' || kind === 'extra' || kind === 'new_volume';

export const NotificationList = () => {
  const [items, setItems] = useState<readonly Notification[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [preferenceEnabled, setPreferenceEnabled] = useState(true);
  const [preferenceKind, setPreferenceKind] = useState<NotificationKind>('new_episode');

  const load = async (): Promise<void> => {
    const response = await client.api.notifications.$get({ query: {} });
    if (!response.ok) {
      setMessage('通知を取得できませんでした。');
      return;
    }
    const { page, unreadCount } = await response.json();
    setItems(page.items);
    setMessage(unreadCount === 0 ? '未読通知はありません。' : `未読通知: ${unreadCount}件`);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section aria-live="polite">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const response = await client.api.settings['notification-preferences'].$put({
            json: {
              channel: 'in_app',
              enabled: preferenceEnabled,
              kind: preferenceKind,
            },
          });
          setMessage(response.ok ? '通知設定を保存しました。' : '通知設定を保存できませんでした。');
        }}
      >
        <h2>通知設定</h2>
        <label>
          種別
          <select
            onChange={(event) => {
              const kind = event.currentTarget.value;
              if (isNotificationKind(kind)) {
                setPreferenceKind(kind);
                setPreferenceEnabled(defaultNotificationEnabled(kind));
              }
            }}
            value={preferenceKind}
          >
            {notificationKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            checked={preferenceEnabled}
            onChange={(event) => setPreferenceEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          アプリ内通知を受け取る
        </label>
        <button type="submit">設定を保存</button>
      </form>
      <h2>通知一覧</h2>
      <button
        onClick={async () => {
          const response = await client.api.notifications['read-all'].$post();
          setMessage(response.ok ? 'すべて既読にしました。' : '通知を既読にできませんでした。');
          if (response.ok) await load();
        }}
        type="button"
      >
        すべて既読にする
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.kind} / {item.readAt ? '既読' : '未読'}
            {!item.readAt ? (
              <button
                onClick={async () => {
                  const response = await client.api.notifications[':id'].read.$post({
                    param: { id: item.id },
                  });
                  setMessage(response.ok ? '既読にしました。' : '通知を既読にできませんでした。');
                  if (response.ok) await load();
                }}
                type="button"
              >
                既読にする
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p>{message}</p>
    </section>
  );
};
