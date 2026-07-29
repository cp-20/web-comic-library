'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
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
    <section aria-labelledby="reading-controls-heading" className="grid gap-6">
      <h2 className="text-lg font-semibold" id="reading-controls-heading">
        読書状態と既読
      </h2>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const status = String(form.get('status'));
          const visibility = String(form.get('visibility'));
          const shareActivity = form.get('shareActivity') === 'on';
          if (
            !isReadingStatus(status) ||
            (visibility !== 'public' && visibility !== 'followers' && visibility !== 'private')
          )
            return;
          const response = await client.api.library.status.$post({
            json: { shareActivity, status, visibility, workId },
          });
          setMessage(response.ok ? '読書状態を保存しました。' : '読書状態を保存できませんでした。');
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="status" label="読書状態">
            <Select defaultValue="reading" id="status" name="status">
              <option value="want_to_read">読みたい</option>
              <option value="reading">読んでいる</option>
              <option value="paused">一時中断</option>
              <option value="dropped">読むのをやめた</option>
              <option value="completed">読み切った</option>
            </Select>
          </Field>
          <Field id="visibility" label="記録の公開範囲">
            <Select defaultValue="private" id="visibility" name="visibility">
              <option value="private">非公開</option>
              <option value="followers">フォロワー限定</option>
              <option value="public">公開</option>
            </Select>
          </Field>
        </div>
        <Checkbox label="この状態変更をfollow中の利用者へ共有する" name="shareActivity" />
        <div>
          <Button type="submit">状態を保存</Button>
        </div>
      </form>
      <form
        className="grid gap-4 border-t border-border-subtle pt-6"
        onSubmit={async (event) => {
          event.preventDefault();
          const ids = readIds(event.currentTarget);
          const response = await client.api.library.reads.$post({
            json: { contentUnitIds: ids, visibility: null, workId },
          });
          setMessage(response.ok ? '既読にしました。' : '既読を保存できませんでした。');
        }}
      >
        <Field id="contentUnitIds" label="論理話ID（カンマ区切り）">
          <Input id="contentUnitIds" name="contentUnitIds" required />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">選択した話を既読にする</Button>
          <Button
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
            variant="secondary"
          >
            指定話まで既読にする
          </Button>
          <Button
            onClick={async (event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              const response = await client.api.library.reads.$delete({
                json: { contentUnitIds: readIds(form), workId },
              });
              setMessage(response.ok ? '既読を取り消しました。' : '既読を取り消せませんでした。');
            }}
            type="button"
            variant="danger"
          >
            既読を取り消す
          </Button>
        </div>
      </form>
      <form
        className="grid gap-4 border-t border-border-subtle pt-6"
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
        <Field id="publicationEntryId" label="読んだ掲載ページID">
          <Input id="publicationEntryId" name="publicationEntryId" required />
        </Field>
        <div>
          <Button type="submit">掲載ページを既読にする</Button>
        </div>
      </form>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
    </section>
  );
};
