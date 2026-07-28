import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  title: 'Web Comic Library',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <footer>
          <nav aria-label="法務と連絡先">
            <Link href="/terms">利用規約</Link> <Link href="/privacy">privacy policy</Link>{' '}
            <Link href="/account-deletion">削除依頼</Link>{' '}
            <Link href="/copyright">著作権侵害の連絡</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
