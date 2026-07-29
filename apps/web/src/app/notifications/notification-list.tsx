'use client';

import { useEffect, useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { EmptyState } from '../../components/ui/empty-state';
import { Field } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { createApiClient } from '../../lib/api-client';
import { EmailDigestSettings } from './email-digest-settings';
import { PushSettings } from './push-settings';

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
    <div aria-live="polite" className="grid gap-10">
      <section aria-labelledby="notification-preference-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="notification-preference-heading">
          通知設定
        </h2>
        <form
          className="grid gap-4 md:max-w-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const response = await client.api.settings['notification-preferences'].$put({
              json: {
                channel: 'in_app',
                enabled: preferenceEnabled,
                kind: preferenceKind,
              },
            });
            setMessage(
              response.ok ? '通知設定を保存しました。' : '通知設定を保存できませんでした。',
            );
          }}
        >
          <Field id="notification-preference-kind" label="種別">
            <Select
              id="notification-preference-kind"
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
            </Select>
          </Field>
          <Checkbox
            checked={preferenceEnabled}
            label="アプリ内通知を受け取る"
            onChange={(event) => setPreferenceEnabled(event.currentTarget.checked)}
          />
          <Button className="justify-self-start" type="submit">
            設定を保存
          </Button>
        </form>
      </section>
      <EmailDigestSettings />
      <PushSettings />
      <section aria-labelledby="notification-list-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold" id="notification-list-heading">
            通知一覧
          </h2>
          <Button
            className="ml-auto"
            onClick={async () => {
              const response = await client.api.notifications['read-all'].$post();
              setMessage(response.ok ? 'すべて既読にしました。' : '通知を既読にできませんでした。');
              if (response.ok) await load();
            }}
            type="button"
            variant="secondary"
          >
            すべて既読にする
          </Button>
        </div>
        {items.length === 0 && message === '未読通知はありません。' ? (
          <EmptyState
            description="フォローしている作品に更新があると、ここに通知が届きます。"
            title="通知はありません。"
          />
        ) : null}
        {items.length === 0 ? null : (
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3" key={item.id}>
                <p className="font-medium">{item.kind}</p>
                <Badge variant={item.readAt ? 'neutral' : 'accent'}>
                  {item.readAt ? '既読' : '未読'}
                </Badge>
                {!item.readAt ? (
                  <Button
                    className="ml-auto"
                    onClick={async () => {
                      const response = await client.api.notifications[':id'].read.$post({
                        param: { id: item.id },
                      });
                      setMessage(
                        response.ok ? '既読にしました。' : '通知を既読にできませんでした。',
                      );
                      if (response.ok) await load();
                    }}
                    type="button"
                    variant="ghost"
                  >
                    既読にする
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
};
