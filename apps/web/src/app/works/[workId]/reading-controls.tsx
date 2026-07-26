'use client';

import { useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');

type ReadingStatusValue = 'want_to_read' | 'reading' | 'paused' | 'dropped' | 'completed';

const isReadingStatus = (value: string): value is ReadingStatusValue =>
  value === 'want_to_read' ||
  value === 'reading' ||
  value === 'paused' ||
  value === 'dropped' ||
  value === 'completed';

const parseContentUnitIds = (value: string): string[] =>
  value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

export const ReadingControls = ({ workId }: Readonly<{ workId: string }>) => {
  const [message, setMessage] = useState<string | null>(null);

  const readIds = (form: HTMLFormElement): string[] =>
    parseContentUnitIds(String(new FormData(form).get('contentUnitIds') ?? ''));

  return (
    <section aria-labelledby="reading-controls-heading">
      <h2 id="reading-controls-heading">読書状態と既読</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const status = String(form.get('status'));
          const visibility = String(form.get('visibility'));
          if (
            !isReadingStatus(status) ||
            (visibility !== 'public' && visibility !== 'followers' && visibility !== 'private')
          )
            return;
          const response = await client.api.library.status.$post({
            json: { status, visibility, workId },
          });
          setMessage(response.ok ? '読書状態を保存しました。' : '読書状態を保存できませんでした。');
        }}
      >
        <label htmlFor="status">読書状態</label>
        <select defaultValue="reading" id="status" name="status">
          <option value="want_to_read">読みたい</option>
          <option value="reading">読んでいる</option>
          <option value="paused">一時中断</option>
          <option value="dropped">読むのをやめた</option>
          <option value="completed">読み切った</option>
        </select>
        <label htmlFor="visibility">記録の公開範囲</label>
        <select defaultValue="private" id="visibility" name="visibility">
          <option value="private">非公開</option>
          <option value="followers">フォロワー限定</option>
          <option value="public">公開</option>
        </select>
        <button type="submit">状態を保存</button>
      </form>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const ids = readIds(event.currentTarget);
          const response = await client.api.library.reads.$post({
            json: { contentUnitIds: ids, visibility: null, workId },
          });
          setMessage(response.ok ? '既読にしました。' : '既読を保存できませんでした。');
        }}
      >
        <label htmlFor="contentUnitIds">論理話ID（カンマ区切り）</label>
        <input id="contentUnitIds" name="contentUnitIds" required />
        <button type="submit">選択した話を既読にする</button>
        <button
          onClick={async (event) => {
            const form = event.currentTarget.form;
            if (!form) return;
            const ids = readIds(form);
            const response = await client.api.library.reads.through.$post({
              json: { contentUnitId: ids.at(-1) ?? '', visibility: null, workId },
            });
            setMessage(
              response.ok ? '指定話まで既読にしました。' : '指定話まで既読にできませんでした。',
            );
          }}
          type="button"
        >
          指定話まで既読にする
        </button>
        <button
          onClick={async (event) => {
            const form = event.currentTarget.form;
            if (!form) return;
            const response = await client.api.library.reads.$delete({
              json: { contentUnitIds: readIds(form), workId },
            });
            setMessage(response.ok ? '既読を取り消しました。' : '既読を取り消せませんでした。');
          }}
          type="button"
        >
          既読を取り消す
        </button>
      </form>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const publicationEntryId = String(
            new FormData(event.currentTarget).get('publicationEntryId') ?? '',
          );
          const response = await client.api.library['publication-reads'].$post({
            json: { publicationEntryId, visibility: null, workId },
          });
          setMessage(
            response.ok ? '掲載ページを既読にしました。' : '掲載ページを記録できませんでした。',
          );
        }}
      >
        <label htmlFor="publicationEntryId">読んだ掲載ページID</label>
        <input id="publicationEntryId" name="publicationEntryId" required />
        <button type="submit">掲載ページを既読にする</button>
      </form>
      <p aria-live="polite">{message}</p>
    </section>
  );
};
