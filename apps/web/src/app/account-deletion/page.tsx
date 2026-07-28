import Link from 'next/link';

export const metadata = { title: 'account削除依頼 | Web Comic Library' };

export default function AccountDeletionPage() {
  return (
    <main>
      <h1>account削除依頼</h1>
      <p>ログイン後、プロフィール設定にある「accountを削除する」から削除を開始できます。</p>
      <p>
        開始直後にprofile、活動、読書記録は第三者から見えなくなります。個人dataは30日以内に削除します。
      </p>
      <Link href="/settings/profile">プロフィール設定へ進む</Link>
    </main>
  );
}
