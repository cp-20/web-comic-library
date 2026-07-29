import Link from 'next/link';

import { PageHeader } from '../../components/ui/page-header';

export const metadata = { title: 'account削除依頼 | Web Comic Library' };

export default function AccountDeletionPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="account削除依頼" />
      <div className="grid max-w-[68ch] gap-6">
        <p>ログイン後、プロフィール設定にある「accountを削除する」から削除を開始できます。</p>
        <p>
          開始直後にprofile、活動、読書記録は第三者から見えなくなります。個人dataは30日以内に削除します。
        </p>
        <p>
          <Link className="font-medium text-accent underline" href="/settings/profile">
            プロフィール設定へ進む
          </Link>
        </p>
      </div>
    </div>
  );
}
