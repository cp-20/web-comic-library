'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const ExtensionPairing = () => {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="pairing-heading" className="grid max-w-lg gap-4">
      <h2 className="text-lg font-semibold" id="pairing-heading">
        pairing codeの発行
      </h2>
      <div>
        <Button
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
          type="button"
        >
          pairing codeを発行
        </Button>
      </div>
      {code ? (
        <output aria-label="pairing code" className="font-mono text-lg tracking-widest">
          {code}
        </output>
      ) : null}
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </section>
  );
};
