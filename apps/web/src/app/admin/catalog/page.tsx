'use client';

import { useState, type FormEvent } from 'react';

import { createApiClient } from '../../../lib/api-client';

type Operation = 'contentUnitMerge' | 'contentUnitSplit' | 'workMerge' | 'workSplit';
type SerialStatus = 'completed' | 'hiatus' | 'ongoing' | 'unknown';

const client = createApiClient('');

const splitIds = (value: string): string[] => {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
};

const parseSerialStatus = (value: FormDataEntryValue | null): SerialStatus => {
  switch (value) {
    case 'completed':
    case 'hiatus':
    case 'ongoing':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
};

export default function CatalogAdminPage() {
  const [message, setMessage] = useState(
    '管理者のpasskeyまたは二要素認証を確認してから操作してください。',
  );

  const submit = async (event: FormEvent<HTMLFormElement>, operation: Operation): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason') ?? '');

    try {
      let response: Response;

      if (operation === 'workMerge') {
        response = await client.api.admin.catalog.works.merge.$post({
          json: {
            reason,
            sourceWorkId: String(form.get('sourceWorkId') ?? ''),
            targetWorkId: String(form.get('targetWorkId') ?? ''),
          },
        });
      } else if (operation === 'contentUnitMerge') {
        response = await client.api.admin.catalog['content-units'].merge.$post({
          json: {
            reason,
            sourceContentUnitId: String(form.get('sourceContentUnitId') ?? ''),
            targetContentUnitId: String(form.get('targetContentUnitId') ?? ''),
          },
        });
      } else if (operation === 'workSplit') {
        response = await client.api.admin.catalog.works.split.$post({
          json: {
            contentUnitIds: splitIds(String(form.get('contentUnitIds') ?? '')),
            publicationIds: splitIds(String(form.get('publicationIds') ?? '')),
            reason,
            serialStatus: parseSerialStatus(form.get('serialStatus')),
            sourceWorkId: String(form.get('sourceWorkId') ?? ''),
            title: String(form.get('title') ?? ''),
          },
        });
      } else {
        response = await client.api.admin.catalog['content-units'].split.$post({
          json: {
            entryIds: splitIds(String(form.get('entryIds') ?? '')),
            position: Number(form.get('position')),
            reason,
            sourceContentUnitId: String(form.get('sourceContentUnitId') ?? ''),
            title: String(form.get('title') ?? ''),
          },
        });
      }

      setMessage(
        response.ok
          ? '操作を記録しました。'
          : `操作は受け付けられませんでした (${response.status})。`,
      );
    } catch {
      setMessage('接続に失敗しました。認証状態とネットワークを確認してください。');
    }
  };

  return (
    <main>
      <h1>カタログ管理</h1>
      <p aria-live="polite">{message}</p>

      <section aria-labelledby="work-merge-title">
        <h2 id="work-merge-title">作品を統合</h2>
        <form onSubmit={(event) => submit(event, 'workMerge')}>
          <label>
            統合元作品 ID
            <input name="sourceWorkId" required />
          </label>
          <label>
            正規作品 ID
            <input name="targetWorkId" required />
          </label>
          <label>
            理由
            <textarea name="reason" required />
          </label>
          <button type="submit">作品を統合する</button>
        </form>
      </section>

      <section aria-labelledby="content-merge-title">
        <h2 id="content-merge-title">話を統合</h2>
        <form onSubmit={(event) => submit(event, 'contentUnitMerge')}>
          <label>
            統合元話 ID
            <input name="sourceContentUnitId" required />
          </label>
          <label>
            正規話 ID
            <input name="targetContentUnitId" required />
          </label>
          <label>
            理由
            <textarea name="reason" required />
          </label>
          <button type="submit">話を統合する</button>
        </form>
      </section>

      <section aria-labelledby="work-split-title">
        <h2 id="work-split-title">作品を分割</h2>
        <form onSubmit={(event) => submit(event, 'workSplit')}>
          <label>
            分割元作品 ID
            <input name="sourceWorkId" required />
          </label>
          <label>
            移動する掲載 ID（カンマ区切り）
            <input name="publicationIds" required />
          </label>
          <label>
            移動する話 ID（カンマ区切り）
            <input name="contentUnitIds" required />
          </label>
          <label>
            新しい作品名
            <input name="title" required />
          </label>
          <label>
            連載状態
            <select defaultValue="unknown" name="serialStatus">
              <option value="ongoing">連載中</option>
              <option value="hiatus">休載</option>
              <option value="completed">完結</option>
              <option value="unknown">不明</option>
            </select>
          </label>
          <label>
            理由
            <textarea name="reason" required />
          </label>
          <button type="submit">作品を分割する</button>
        </form>
      </section>

      <section aria-labelledby="content-split-title">
        <h2 id="content-split-title">話と対応付けを分割</h2>
        <form onSubmit={(event) => submit(event, 'contentUnitSplit')}>
          <label>
            分割元話 ID
            <input name="sourceContentUnitId" required />
          </label>
          <label>
            移動する掲載ページ ID（カンマ区切り）
            <input name="entryIds" required />
          </label>
          <label>
            新しい話名
            <input name="title" required />
          </label>
          <label>
            順序
            <input min="0" name="position" required type="number" />
          </label>
          <label>
            理由
            <textarea name="reason" required />
          </label>
          <button type="submit">話を分割する</button>
        </form>
      </section>
    </main>
  );
}
