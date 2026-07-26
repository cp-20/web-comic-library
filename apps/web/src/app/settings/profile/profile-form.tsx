'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const ProfileForm = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const visibility = String(form.get('visibility') ?? '');
        if (visibility !== 'public' && visibility !== 'followers' && visibility !== 'private') {
          setMessage('公開範囲を選択してください。');
          return;
        }
        const response = await client.api.settings.profile.$put({
          json: {
            bio: String(form.get('bio') ?? '') || null,
            displayName: String(form.get('displayName') ?? ''),
            userId: String(form.get('userId') ?? ''),
            visibility,
          },
        });
        if (!response.ok) {
          setMessage('保存できませんでした。ログイン状態を確認してください。');
          return;
        }
        const icon = form.get('icon');
        if (icon instanceof File && icon.size > 0) {
          const iconForm = new FormData();
          iconForm.set('icon', icon);
          const iconResponse = await fetch('/api/settings/profile/icon', {
            body: iconForm,
            method: 'POST',
          });
          setMessage(iconResponse.ok ? '保存しました。' : '画像を保存できませんでした。');
          return;
        }
        setMessage('保存しました。');
      }}
    >
      <label htmlFor="userId">ユーザーID</label>
      <input id="userId" name="userId" required pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]" />
      <label htmlFor="displayName">表示名</label>
      <input id="displayName" name="displayName" required maxLength={100} />
      <label htmlFor="bio">自己紹介</label>
      <textarea id="bio" name="bio" maxLength={1000} />
      <label htmlFor="icon">プロフィール画像（PNG、2 MiB以下、512px以下）</label>
      <input accept="image/png" id="icon" name="icon" type="file" />
      <label htmlFor="visibility">標準公開範囲</label>
      <select id="visibility" name="visibility" defaultValue="private">
        <option value="private">非公開</option>
        <option value="followers">フォロワー限定</option>
        <option value="public">公開</option>
      </select>
      <button type="submit">保存</button>
      <p aria-live="polite">{message}</p>
    </form>
  );
};
