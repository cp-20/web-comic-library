import Link from 'next/link';

import { LogoutButton } from './logout-button';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'プロフィール設定 | Web Comic Library' };

export default function ProfileSettingsPage() {
  return (
    <main>
      <h1>プロフィール設定</h1>
      <p>公開範囲を選ぶまで、プロフィールと読書記録は非公開です。</p>
      <ProfileForm />
      <Link href="/settings/follows">掲載先とfollow設定</Link>
      <Link href="/settings/extension">browser extension連携</Link>
      <LogoutButton />
    </main>
  );
}
