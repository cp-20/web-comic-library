'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main>
          <h1>エラーが発生しました</h1>
          <p>時間をおいて、もう一度お試しください。</p>
        </main>
      </body>
    </html>
  );
}
