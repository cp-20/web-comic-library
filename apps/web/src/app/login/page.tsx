import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main>
      <h1>ログイン</h1>
      <p>メールのログインリンク、またはGoogleで安全にログインできます。</p>
      <LoginForm />
    </main>
  );
}
