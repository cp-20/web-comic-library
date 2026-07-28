'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const AccountDataControls = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="account-data-heading">
      <h2 id="account-data-heading">dataのexportとaccount削除</h2>
      <button
        type="button"
        onClick={async () => {
          const response = await client.api.settings['data-exports'].$post();
          if (!response.ok) {
            setMessage('data exportを開始できませんでした。');
            return;
          }
          const payload: Readonly<{ downloadUrl: string }> = await response.json();
          setMessage('exportを生成しています。しばらくしてから次のURLを開いてください。');
          window.setTimeout(() => window.location.assign(payload.downloadUrl), 1_000);
        }}
      >
        JSON exportを作成する
      </button>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const confirmed = window.confirm(
            'accountは直ちに非表示になり、30日後に個人dataを削除します。続けますか？',
          );
          if (!confirmed) return;
          const response = await client.api.settings['account-deletion'].$post({
            json: { confirmation: 'DELETE ACCOUNT' },
          });
          setMessage(
            response.ok
              ? 'accountを非表示にしました。30日後に個人dataを削除します。'
              : 'account削除を開始できませんでした。',
          );
        }}
      >
        <button type="submit">accountを削除する</button>
      </form>
      <p aria-live="polite">{message}</p>
    </section>
  );
};
