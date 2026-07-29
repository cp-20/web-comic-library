import { PageHeader } from '../../../../../components/ui/page-header';
import { FavoriteImportConfirmation } from './favorite-import-confirmation';

export const metadata = { title: 'お気に入りを取り込む | Web Comic Library' };

export default async function FavoriteImportPage({
  params,
}: Readonly<{ params: Promise<{ batchId: string }> }>) {
  const { batchId } = await params;
  return (
    <div className="grid gap-8">
      <PageHeader
        description="お気に入りから既読や読書進捗は作成しません。"
        title="お気に入りを取り込む"
      />
      <FavoriteImportConfirmation batchId={batchId} />
    </div>
  );
}
