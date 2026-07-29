'use client';

import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

const defaultTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const EmailDigestSettings = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sendTime, setSendTime] = useState('09:00');
  const [timezone, setTimezone] = useState(defaultTimezone);

  return (
    <section aria-labelledby="email-digest-heading" aria-live="polite" className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold" id="email-digest-heading">
          メール更新通知
        </h2>
        <p className="text-sm text-text-muted">
          1日の更新をまとめて、指定した時刻にメールで受け取ります。
        </p>
      </div>
      <form
        className="grid gap-4 md:max-w-md"
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
        <Checkbox
          checked={enabled}
          label="1日の更新をまとめてメールで受け取る"
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        <Field id="email-digest-timezone" label="timezone">
          <Input
            id="email-digest-timezone"
            onChange={(event) => setTimezone(event.currentTarget.value)}
            required
            value={timezone}
          />
        </Field>
        <Field id="email-digest-sendTime" label="送信時刻">
          <Input
            id="email-digest-sendTime"
            onChange={(event) => setSendTime(event.currentTarget.value)}
            type="time"
            value={sendTime}
          />
        </Field>
        <Button className="justify-self-start" type="submit">
          設定を保存
        </Button>
      </form>
      <Button
        className="justify-self-start"
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
        variant="secondary"
      >
        メール更新通知を停止
      </Button>
      <p className="text-sm text-text-muted">{message}</p>
    </section>
  );
};
