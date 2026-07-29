'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body className="bg-canvas font-sans leading-[1.7] text-text">
        <main className="mx-auto flex min-h-dvh w-full max-w-[68ch] flex-col justify-center gap-2 px-4 py-8">
          <h1 className="text-2xl font-semibold">エラーが発生しました</h1>
          <p className="text-text-muted">時間をおいて、もう一度お試しください。</p>
        </main>
      </body>
    </html>
  );
}
