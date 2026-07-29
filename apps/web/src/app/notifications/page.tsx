import { PageHeader } from '../../components/ui/page-header';
import { NotificationList } from './notification-list';

export default function NotificationsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader description="アプリ内通知と通知の受け取り方を管理します。" title="通知" />
      <NotificationList />
    </div>
  );
}
