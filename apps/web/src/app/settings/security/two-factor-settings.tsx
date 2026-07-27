'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type Enrollment = Readonly<{
  backupCodes: readonly string[];
  totpURI: string;
}>;

const isEnrollment = (value: unknown): value is Enrollment => {
  if (!value || typeof value !== 'object') return false;
  if (!('backupCodes' in value) || !('totpURI' in value)) return false;
  return (
    Array.isArray(value.backupCodes) &&
    value.backupCodes.every((code) => typeof code === 'string') &&
    typeof value.totpURI === 'string'
  );
};

export const TwoFactorSettings = () => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const startEnrollment = async (): Promise<void> => {
    const response = await client.api.settings['two-factor'].enable.$post({
      json: { issuer: 'Web Comic Library' },
    });
    if (!response.ok) {
      setMessage('設定を開始できませんでした。ログイン状態を確認してください。');
      return;
    }
    const enrollmentResponse: unknown = await response.json();
    if (!isEnrollment(enrollmentResponse)) {
      setMessage('設定情報を確認できませんでした。もう一度開始してください。');
      return;
    }
    setEnrollment(enrollmentResponse);
    setMessage('認証アプリへURIを登録してから、6桁の確認コードを入力してください。');
  };

  const verify = async (code: string): Promise<void> => {
    const response = await client.api.settings['two-factor'].verify.$post({ json: { code } });
    if (!response.ok) {
      setMessage('確認できませんでした。認証アプリの現在のコードを入力してください。');
      return;
    }
    setEnrollment(null);
    setMessage('二要素認証を確認しました。重要な操作ではこのsessionの強い認証が使用されます。');
  };

  return (
    <section aria-labelledby="two-factor-heading">
      <h2 id="two-factor-heading">認証アプリ（TOTP）</h2>
      <button onClick={() => void startEnrollment()} type="button">
        設定を開始する
      </button>
      {enrollment ? (
        <>
          <p>認証アプリに次のURIを登録してください。</p>
          <output>{enrollment.totpURI}</output>
          <p>バックアップコードは一度だけ表示されます。安全な場所へ保管してください。</p>
          <ul>
            {enrollment.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void verify(String(form.get('code') ?? ''));
            }}
          >
            <label htmlFor="twoFactorCode">認証アプリの6桁コード</label>
            <input
              autoComplete="one-time-code"
              id="twoFactorCode"
              inputMode="numeric"
              maxLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
            />
            <button type="submit">確認する</button>
          </form>
        </>
      ) : null}
      <p aria-live="polite">{message}</p>
    </section>
  );
};
