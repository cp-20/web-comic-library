'use client';

import { useState } from 'react';

import { createApiClient } from '../../lib/api-client';

const client = createApiClient('');

export const LoginForm = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const email = String(new FormData(event.currentTarget).get('email') ?? '');
          const response = await client.api.login['magic-link'].$post({ json: { email } });
          setMessage(response.ok ? 'ログインリンクを送信しました。' : '送信できませんでした。');
        }}
      >
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" required type="email" autoComplete="email" />
        <button type="submit">ログインリンクを送る</button>
      </form>
      <button
        onClick={async () => {
          const response = await client.api.login.google.$post();
          if (!response.ok) {
            setMessage('Googleログインを開始できませんでした。');
            return;
          }
          const result: unknown = await response.json();
          if (
            typeof result === 'object' &&
            result !== null &&
            'url' in result &&
            typeof result.url === 'string'
          ) {
            window.location.assign(result.url);
            return;
          }
          setMessage('Googleログインを開始できませんでした。');
        }}
        type="button"
      >
        Googleで続ける
      </button>
      <p aria-live="polite">{message}</p>
    </>
  );
};
