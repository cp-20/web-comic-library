import { PageHeader } from '../../../components/ui/page-header';
import { FollowSettingsForm } from './settings-form';
import { UserFollowList } from './user-follow-list';

export const metadata = { title: '掲載先とfollow設定 | Web Comic Library' };

export default function FollowSettingsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        description="掲載先の優先順位はすべての作品のsite優先方式に反映されます。"
        title="掲載先とfollow設定"
      />
      <FollowSettingsForm />
      <UserFollowList />
    </div>
  );
}
