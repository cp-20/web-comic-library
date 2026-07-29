'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

export const ProfileForm = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="profile-form-heading" className="grid gap-4">
      <h2 className="text-lg font-semibold" id="profile-form-heading">
        プロフィール
      </h2>
      <form
        className="grid max-w-lg gap-4"
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
        <Field id="userId" label="ユーザーID">
          <Input id="userId" name="userId" pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]" required />
        </Field>
        <Field id="displayName" label="表示名">
          <Input id="displayName" maxLength={100} name="displayName" required />
        </Field>
        <Field id="bio" label="自己紹介">
          <Textarea id="bio" maxLength={1000} name="bio" />
        </Field>
        <Field id="icon" label="プロフィール画像（PNG、2 MiB以下、512px以下）">
          <Input accept="image/png" id="icon" name="icon" type="file" />
        </Field>
        <Field id="visibility" label="標準公開範囲">
          <Select defaultValue="private" id="visibility" name="visibility">
            <option value="private">非公開</option>
            <option value="followers">フォロワー限定</option>
            <option value="public">公開</option>
          </Select>
        </Field>
        <div>
          <Button type="submit">保存</Button>
        </div>
        <p aria-live="polite" className="text-sm text-text-muted">
          {message}
        </p>
      </form>
    </section>
  );
};
