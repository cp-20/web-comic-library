'use client';

import { useState } from 'react';

import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

const defaultTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const EmailDigestSettings = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sendTime, setSendTime] = useState('09:00');
  const [timezone, setTimezone] = useState(defaultTimezone);

  return (
    <section aria-live="polite">
      <h2>メール更新通知</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const response = await client.api.settings['email-digest'].$put({
            json: { enabled, sendTime, timezone },
          });
          setMessage(
            response.ok
              ? 'メール更新通知を保存しました。'
              : 'メール更新通知を保存できませんでした。',
          );
        }}
      >
        <label>
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          1日の更新をまとめてメールで受け取る
        </label>
        <label>
          timezone
          <input
            onChange={(event) => setTimezone(event.currentTarget.value)}
            required
            value={timezone}
          />
        </label>
        <label>
          送信時刻
          <input
            onChange={(event) => setSendTime(event.currentTarget.value)}
            type="time"
            value={sendTime}
          />
        </label>
        <button type="submit">設定を保存</button>
      </form>
      <button
        onClick={async () => {
          const response = await client.api.settings['email-digest'].unsubscribe.$post();
          if (response.ok) setEnabled(false);
          setMessage(
            response.ok
              ? 'メール更新通知を停止しました。'
              : 'メール更新通知を停止できませんでした。',
          );
        }}
        type="button"
      >
        メール更新通知を停止
      </button>
      <p>{message}</p>
    </section>
  );
};
