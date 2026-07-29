'use client';

import { Bell, Book, Compass, History, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type NavItem = Readonly<{
  href: string;
  icon: typeof Compass;
  label: string;
}>;

const navItems: readonly NavItem[] = [
  { href: '/', icon: Compass, label: '探す' },
  { href: '/library/volumes', icon: Book, label: '本棚' },
  { href: '/timeline', icon: History, label: 'タイムライン' },
  { href: '/notifications', icon: Bell, label: '通知' },
];

const settingsItems = [
  { href: '/settings/profile', label: 'プロフィールと公開範囲' },
  { href: '/settings/security', label: '二要素認証とセキュリティ' },
  { href: '/settings/follows', label: 'followと掲載先の設定' },
  { href: '/settings/extension', label: 'extension連携' },
];

const isActive = (pathname: string, href: string): boolean => {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
};

const ProfileMenu = () => {
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-3 text-text hover:bg-surface-subtle">
        <Settings aria-hidden className="size-5" />
        <span>設定</span>
      </summary>
      <ul className="absolute right-0 top-full z-20 mt-1 w-60 rounded-panel border border-border-subtle bg-surface p-1 shadow-md lg:bottom-full lg:left-0 lg:mb-1 lg:mr-0 lg:mt-0 lg:top-auto">
        {settingsItems.map((item) => (
          <li key={item.href}>
            <Link
              className="block rounded-control px-3 py-2.5 hover:bg-surface-subtle"
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
};

const SideNav = ({ pathname }: Readonly<{ pathname: string }>) => {
  return (
    <nav aria-label="主要メニュー" className="grid gap-1">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-control px-3 ${
              active
                ? 'bg-surface-subtle font-semibold text-accent'
                : 'text-text hover:bg-surface-subtle'
            }`}
            href={item.href}
            key={item.href}
          >
            <item.icon aria-hidden className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

const BottomNav = ({ pathname }: Readonly<{ pathname: string }>) => {
  return (
    <nav
      aria-label="主要メニュー"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="grid grid-cols-4">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-sm ${
                active ? 'font-semibold text-accent' : 'text-text-muted'
              }`}
              href={item.href}
              key={item.href}
            >
              <item.icon aria-hidden className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

const legalItems = [
  { href: '/terms', label: '利用規約' },
  { href: '/privacy', label: 'privacy policy' },
  { href: '/account-deletion', label: '削除依頼' },
  { href: '/copyright', label: '著作権侵害の連絡' },
];

const SiteFooter = () => {
  return (
    <footer className="border-t border-border-subtle px-4 py-6 text-sm text-text-muted">
      <nav aria-label="法務と連絡先" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {legalItems.map((item) => (
          <Link className="hover:underline" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
};

type AppShellProps = Readonly<{
  children: ReactNode;
  signedIn: boolean;
}>;

export const AppShell = ({ children, signedIn }: AppShellProps) => {
  const pathname = usePathname();
  const titleLink = (
    <Link className="inline-flex min-h-11 items-center text-lg font-semibold" href="/">
      Web Comic Library
    </Link>
  );

  if (!signedIn) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle bg-surface px-4 py-1">
          {titleLink}
          <nav aria-label="公開メニュー" className="flex items-center gap-6">
            <Link className="inline-flex min-h-11 items-center hover:underline" href="/">
              探す
            </Link>
            <Link className="inline-flex min-h-11 items-center hover:underline" href="/login">
              ログイン
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <header className="flex items-center justify-between gap-4 border-b border-border-subtle bg-surface px-4 py-1 lg:hidden">
        {titleLink}
        <ProfileMenu />
      </header>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-border-subtle lg:bg-surface lg:p-4">
        {titleLink}
        <SideNav pathname={pathname} />
        <div className="mt-auto">
          <ProfileMenu />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
        <div className="pb-24 lg:pb-0">
          <SiteFooter />
        </div>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  );
};
