'use client';

import { useState } from 'react';

import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

const toApplicationServerKey = (value: string): ArrayBuffer => {
  const padded =
    value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const bytes = atob(padded);
  const output = new ArrayBuffer(bytes.length);
  new Uint8Array(output).set(Uint8Array.from(bytes, (character) => character.charCodeAt(0)));
  return output;
};

export const PushSettings = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-live="polite">
      <h2>Push通知</h2>
      <button
        onClick={async () => {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setMessage('このbrowserはPush通知に対応していません。');
            return;
          }
          const config = await client.api.push.config.$get();
          if (!config.ok) {
            setMessage('Push通知は現在利用できません。');
            return;
          }
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            setMessage('Push通知の許可が必要です。');
            return;
          }
          const registration = await navigator.serviceWorker.register('/sw.js');
          const subscription = await registration.pushManager.subscribe({
            applicationServerKey: toApplicationServerKey((await config.json()).publicKey),
            userVisibleOnly: true,
          });
          const json = subscription.toJSON();
          const response = await client.api.settings['push-subscriptions'].$put({
            json: {
              auth: json.keys?.auth ?? '',
              endpoint: subscription.endpoint,
              p256dh: json.keys?.p256dh ?? '',
            },
          });
          setMessage(
            response.ok ? 'Push通知を有効にしました。' : 'Push通知を保存できませんでした。',
          );
        }}
        type="button"
      >
        Push通知を有効にする
      </button>
      <p>{message}</p>
    </section>
  );
};
