import Link from 'next/link';

import { PageHeader } from '../../../components/ui/page-header';
import { AccountDataControls } from './account-data-controls';
import { LogoutButton } from './logout-button';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'プロフィール設定 | Web Comic Library' };

const relatedLinks: readonly Readonly<{ href: string; label: string }>[] = [
  { href: '/settings/follows', label: '掲載先とfollow設定' },
  { href: '/timeline', label: 'follow中の利用者のtimeline' },
  { href: '/settings/security', label: '二要素認証' },
  { href: '/settings/extension', label: 'browser extension連携' },
];

export default function ProfileSettingsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="公開範囲を選ぶまで、プロフィールと読書記録は非公開です。"
        title="プロフィール設定"
      />
      <ProfileForm />
      <AccountDataControls />
      <section aria-labelledby="settings-related-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="settings-related-heading">
          関連する設定
        </h2>
        <ul className="grid gap-2">
          {relatedLinks.map((link) => (
            <li key={link.href}>
              <Link className="text-accent hover:underline" href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <LogoutButton />
    </div>
  );
}
