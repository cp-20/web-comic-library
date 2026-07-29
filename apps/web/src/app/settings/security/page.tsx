import Link from 'next/link';

import { PageHeader } from '../../../components/ui/page-header';
import { TwoFactorSettings } from './two-factor-settings';

export const metadata = { title: '二要素認証 | Web Comic Library' };

export default function SecuritySettingsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="認証アプリを使って、重要な操作の前に本人確認を行います。"
        title="二要素認証"
      />
      <TwoFactorSettings />
      <p>
        <Link className="text-accent hover:underline" href="/settings/profile">
          プロフィール設定へ戻る
        </Link>
      </p>
    </div>
  );
}
