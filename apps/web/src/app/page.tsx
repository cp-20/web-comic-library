import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Web Comic Library</h1>
      <p>公開作品を見つけ、読む場所と読書の記録を一つにまとめます。</p>
      <nav aria-label="主要メニュー">
        <Link href="/login">ログイン</Link> <Link href="/settings/profile">プロフィール設定</Link>
      </nav>
    </main>
  );
}
