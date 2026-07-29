import { PageHeader } from '../../components/ui/page-header';
import { TimelineList } from './timeline-list';

export const metadata = { title: 'timeline | Web Comic Library' };

export default function TimelinePage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="follow中の利用者の公開activityを新しい順に表示します。"
        title="タイムライン"
      />
      <TimelineList />
    </div>
  );
}
