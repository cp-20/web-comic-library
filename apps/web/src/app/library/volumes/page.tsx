import { PageHeader } from '../../../components/ui/page-header';
import { VolumeLibraryControls } from './volume-library-controls';

export default function VolumeLibraryPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="巻ごとの読書状態と紙・電子の所蔵を記録します。"
        title="単行本ライブラリ"
      />
      <VolumeLibraryControls />
    </div>
  );
}
