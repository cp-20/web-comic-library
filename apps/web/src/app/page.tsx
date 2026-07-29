import { PageHeader } from '../components/ui/page-header';
import { CatalogSearch } from './catalog-search';

export default function HomePage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="公開作品を見つけ、読む場所と読書の記録を一つにまとめます。"
        title="作品を探す"
      />
      <CatalogSearch />
    </div>
  );
}
