'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const AccountDataControls = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="account-data-heading" className="grid max-w-lg gap-4">
      <h2 className="text-lg font-semibold" id="account-data-heading">
        dataのexportとaccount削除
      </h2>
      <div>
        <Button
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
          type="button"
          variant="secondary"
        >
          JSON exportを作成する
        </Button>
      </div>
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
        <Button type="submit" variant="danger">
          accountを削除する
        </Button>
      </form>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </section>
  );
};
