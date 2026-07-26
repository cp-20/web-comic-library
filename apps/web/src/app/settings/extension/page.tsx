import { ExtensionPairing } from './pairing';

export const metadata = { title: 'browser extension連携 | Web Comic Library' };

export default function ExtensionSettingsPage() {
  return (
    <main>
      <h1>browser extension連携</h1>
      <p>このcodeは5分間だけ有効で、一度だけ交換できます。</p>
      <ExtensionPairing />
    </main>
  );
}
