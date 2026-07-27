import Link from 'next/link';

import { TwoFactorSettings } from './two-factor-settings';

export const metadata = { title: '二要素認証 | Web Comic Library' };

export default function SecuritySettingsPage() {
  return (
    <main>
      <h1>二要素認証</h1>
      <p>認証アプリを使って、重要な操作の前に本人確認を行います。</p>
      <TwoFactorSettings />
      <Link href="/settings/profile">プロフィール設定へ戻る</Link>
    </main>
  );
}
