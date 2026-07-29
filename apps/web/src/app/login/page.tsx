import { PageHeader } from '../../components/ui/page-header';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="grid gap-8">
      <PageHeader description="Googleで安全にログインできます。" title="ログイン" />
      <LoginForm />
    </div>
  );
}
