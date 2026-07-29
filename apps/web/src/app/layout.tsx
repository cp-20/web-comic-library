import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AppShell } from '../components/layout/app-shell';

import './globals.css';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  title: 'Web Comic Library',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const signedIn = Boolean(
    cookieStore.get('better-auth.session_token') ??
    cookieStore.get('__Secure-better-auth.session_token'),
  );

  return (
    <html lang="ja">
      <body>
        <AppShell signedIn={signedIn}>{children}</AppShell>
      </body>
    </html>
  );
}
