'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

const splitIds = (value: string): string[] => {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
};

export const FollowSettingsForm = () => {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-8">
      <section aria-labelledby="source-priority-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="source-priority-heading">
          掲載先の優先順位
        </h2>
        <form
          className="grid max-w-lg gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const sourceIds = splitIds(
              String(new FormData(event.currentTarget).get('sourceIds') ?? ''),
            );
            const response = await client.api.settings['source-preferences'].$put({
              json: { sourceIds },
            });
            setMessage(
              response.ok ? '掲載先の優先順位を保存しました。' : '優先順位を保存できませんでした。',
            );
          }}
        >
          <Field id="source-ids" label="掲載先ID（優先順にカンマ区切り）">
            <Textarea id="source-ids" name="sourceIds" />
          </Field>
          <div>
            <Button type="submit">優先順位を保存</Button>
          </div>
        </form>
      </section>
      <section aria-labelledby="work-follow-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="work-follow-heading">
          作品ごとのfollow設定
        </h2>
        <form
          className="grid max-w-lg gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const mode = String(form.get('mode') ?? 'fastest');
            if (
              mode !== 'fastest' &&
              mode !== 'source_priority' &&
              mode !== 'selected_publications' &&
              mode !== 'all_publications'
            ) {
              setMessage('follow方式を選択してください。');
              return;
            }
            const response = await client.api.settings.follows.$put({
              json: {
                mode,
                publicationIds: splitIds(String(form.get('publicationIds') ?? '')),
                workId: String(form.get('workId') ?? '').trim(),
              },
            });
            setMessage(
              response.ok
                ? '作品のfollow設定を保存しました。'
                : 'follow設定を保存できませんでした。',
            );
          }}
        >
          <Field id="follow-work-id" label="作品ID">
            <Input id="follow-work-id" name="workId" required />
          </Field>
          <Field id="follow-mode" label="方式">
            <Select defaultValue="fastest" id="follow-mode" name="mode">
              <option value="fastest">最速の掲載を一度だけ通知</option>
              <option value="source_priority">掲載先の優先順位で通知</option>
              <option value="selected_publications">指定した掲載先だけ通知</option>
              <option value="all_publications">全掲載先を個別に通知</option>
            </Select>
          </Field>
          <Field id="subscription-publication-ids" label="指定する掲載先ID（カンマ区切り）">
            <Textarea id="subscription-publication-ids" name="publicationIds" />
          </Field>
          <div>
            <Button type="submit">follow設定を保存</Button>
          </div>
        </form>
      </section>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </div>
  );
};
