import { PageHeader } from '../../../components/ui/page-header';
import { ExtensionPairing } from './pairing';

export const metadata = { title: 'browser extension連携 | Web Comic Library' };

export default function ExtensionSettingsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="このcodeは5分間だけ有効で、一度だけ交換できます。"
        title="browser extension連携"
      />
      <ExtensionPairing />
    </div>
  );
}
