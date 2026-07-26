import { FollowSettingsForm } from './settings-form';

export const metadata = { title: '掲載先とfollow設定 | Web Comic Library' };

export default function FollowSettingsPage() {
  return (
    <main>
      <h1>掲載先とfollow設定</h1>
      <p>掲載先の優先順位はすべての作品のsite優先方式に反映されます。</p>
      <FollowSettingsForm />
    </main>
  );
}
