import { FavoriteImportConfirmation } from './favorite-import-confirmation';

export const metadata = { title: 'お気に入りを取り込む | Web Comic Library' };

export default async function FavoriteImportPage({
  params,
}: Readonly<{ params: Promise<{ batchId: string }> }>) {
  const { batchId } = await params;
  return (
    <main>
      <h1>お気に入りを取り込む</h1>
      <p>お気に入りから既読や読書進捗は作成しません。</p>
      <FavoriteImportConfirmation batchId={batchId} />
    </main>
  );
}
