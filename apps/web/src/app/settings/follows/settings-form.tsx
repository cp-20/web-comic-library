'use client';

import { useState } from 'react';

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
    <>
      <form
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
        <h2>掲載先の優先順位</h2>
        <label htmlFor="source-ids">掲載先ID（優先順にカンマ区切り）</label>
        <textarea id="source-ids" name="sourceIds" />
        <button type="submit">優先順位を保存</button>
      </form>
      <form
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
            response.ok ? '作品のfollow設定を保存しました。' : 'follow設定を保存できませんでした。',
          );
        }}
      >
        <h2>作品ごとのfollow方式</h2>
        <label htmlFor="follow-work-id">作品ID</label>
        <input id="follow-work-id" name="workId" required />
        <label htmlFor="follow-mode">方式</label>
        <select defaultValue="fastest" id="follow-mode" name="mode">
          <option value="fastest">最速の掲載を一度だけ通知</option>
          <option value="source_priority">掲載先の優先順位で通知</option>
          <option value="selected_publications">指定した掲載先だけ通知</option>
          <option value="all_publications">全掲載先を個別に通知</option>
        </select>
        <label htmlFor="subscription-publication-ids">指定する掲載先ID（カンマ区切り）</label>
        <textarea id="subscription-publication-ids" name="publicationIds" />
        <button type="submit">follow設定を保存</button>
      </form>
      <p aria-live="polite">{message}</p>
    </>
  );
};
