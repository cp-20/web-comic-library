'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const LogoutButton = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="logout-heading" className="grid max-w-lg gap-4">
      <h2 className="text-lg font-semibold" id="logout-heading">
        ログアウト
      </h2>
      <div>
        <Button
          onClick={async () => {
            const response = await client.api.logout.$post();
            setMessage(response.ok ? 'ログアウトしました。' : 'ログアウトできませんでした。');
          }}
          type="button"
          variant="danger"
        >
          ログアウト
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </section>
  );
};
