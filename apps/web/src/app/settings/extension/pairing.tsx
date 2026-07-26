'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const ExtensionPairing = () => {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <button
        type="button"
        onClick={async () => {
          const response = await client.api.extension['pairing-codes'].$post();
          if (!response.ok) {
            setMessage('pairing codeを発行できませんでした。ログイン状態を確認してください。');
            return;
          }
          const issued = await response.json();
          setCode(issued.code);
          setMessage(`有効期限: ${new Date(issued.expiresAt).toLocaleTimeString()}`);
        }}
      >
        pairing codeを発行
      </button>
      {code ? <output aria-label="pairing code">{code}</output> : null}
      <p aria-live="polite">{message}</p>
    </section>
  );
};
