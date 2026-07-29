'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { PageHeader } from '../../../components/ui/page-header';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
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
    <div className="grid gap-10">
      <PageHeader
        description="作品と話の統合・分割を記録します。すべての操作に理由の入力が必要です。"
        title="カタログ管理"
      />
      <p
        aria-live="polite"
        className="rounded-panel border border-border-subtle bg-surface px-4 py-3"
      >
        {message}
      </p>

      <section aria-labelledby="work-merge-title" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="work-merge-title">
          作品を統合
        </h2>
        <form className="grid max-w-2xl gap-4" onSubmit={(event) => submit(event, 'workMerge')}>
          <Field id="work-merge-source" label="統合元作品 ID">
            <Input id="work-merge-source" name="sourceWorkId" required />
          </Field>
          <Field id="work-merge-target" label="正規作品 ID">
            <Input id="work-merge-target" name="targetWorkId" required />
          </Field>
          <Field id="work-merge-reason" label="理由">
            <Textarea id="work-merge-reason" name="reason" required />
          </Field>
          <div>
            <Button type="submit" variant="danger">
              作品を統合する
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="content-merge-title" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="content-merge-title">
          話を統合
        </h2>
        <form
          className="grid max-w-2xl gap-4"
          onSubmit={(event) => submit(event, 'contentUnitMerge')}
        >
          <Field id="content-merge-source" label="統合元話 ID">
            <Input id="content-merge-source" name="sourceContentUnitId" required />
          </Field>
          <Field id="content-merge-target" label="正規話 ID">
            <Input id="content-merge-target" name="targetContentUnitId" required />
          </Field>
          <Field id="content-merge-reason" label="理由">
            <Textarea id="content-merge-reason" name="reason" required />
          </Field>
          <div>
            <Button type="submit" variant="danger">
              話を統合する
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="work-split-title" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="work-split-title">
          作品を分割
        </h2>
        <form className="grid max-w-2xl gap-4" onSubmit={(event) => submit(event, 'workSplit')}>
          <Field id="work-split-source" label="分割元作品 ID">
            <Input id="work-split-source" name="sourceWorkId" required />
          </Field>
          <Field id="work-split-publications" label="移動する掲載 ID（カンマ区切り）">
            <Input id="work-split-publications" name="publicationIds" required />
          </Field>
          <Field id="work-split-units" label="移動する話 ID（カンマ区切り）">
            <Input id="work-split-units" name="contentUnitIds" required />
          </Field>
          <Field id="work-split-title" label="新しい作品名">
            <Input id="work-split-title" name="title" required />
          </Field>
          <Field id="work-split-status" label="連載状態">
            <Select defaultValue="unknown" id="work-split-status" name="serialStatus">
              <option value="ongoing">連載中</option>
              <option value="hiatus">休載</option>
              <option value="completed">完結</option>
              <option value="unknown">不明</option>
            </Select>
          </Field>
          <Field id="work-split-reason" label="理由">
            <Textarea id="work-split-reason" name="reason" required />
          </Field>
          <div>
            <Button type="submit" variant="secondary">
              作品を分割する
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="content-split-title" className="grid gap-4">
        <h2 className="text-lg font-semibold" id="content-split-title">
          話と対応付けを分割
        </h2>
        <form
          className="grid max-w-2xl gap-4"
          onSubmit={(event) => submit(event, 'contentUnitSplit')}
        >
          <Field id="content-split-source" label="分割元話 ID">
            <Input id="content-split-source" name="sourceContentUnitId" required />
          </Field>
          <Field id="content-split-entries" label="移動する掲載ページ ID（カンマ区切り）">
            <Input id="content-split-entries" name="entryIds" required />
          </Field>
          <Field id="content-split-title" label="新しい話名">
            <Input id="content-split-title" name="title" required />
          </Field>
          <Field id="content-split-position" label="順序">
            <Input id="content-split-position" min="0" name="position" required type="number" />
          </Field>
          <Field id="content-split-reason" label="理由">
            <Textarea id="content-split-reason" name="reason" required />
          </Field>
          <div>
            <Button type="submit" variant="secondary">
              話を分割する
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
