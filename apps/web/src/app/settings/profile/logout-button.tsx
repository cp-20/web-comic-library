'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const LogoutButton = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={async () => {
          const response = await client.api.logout.$post();
          setMessage(response.ok ? 'ログアウトしました。' : 'ログアウトできませんでした。');
        }}
        type="button"
      >
        ログアウト
      </button>
      <p aria-live="polite">{message}</p>
    </>
  );
};
