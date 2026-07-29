'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { createApiClient } from '../lib/api-client';

const client = createApiClient('');

type PublicationKind = 'all' | 'official' | 'user_submission';
type SerialStatus = 'all' | 'completed' | 'hiatus' | 'ongoing' | 'unknown';
type Sort = 'new' | 'popular' | 'recent';
type SearchResult = Readonly<{
  latestUpdatedAt: string | null;
  work: Readonly<{
    creators: readonly Readonly<{ id: string; name: string }>[];
    id: string;
    serialStatus: string;
    title: string;
  }>;
}>;

const serialStatusLabels: Record<string, string> = {
  completed: '完結',
  hiatus: '休載',
  ongoing: '連載中',
  unknown: '不明',
};

const parsePublicationKind = (value: string): PublicationKind => {
  return value === 'official' || value === 'user_submission' ? value : 'all';
};

const parseSerialStatus = (value: string): SerialStatus => {
  return value === 'completed' || value === 'hiatus' || value === 'ongoing' || value === 'unknown'
    ? value
    : 'all';
};

const parseSort = (value: string): Sort => {
  return value === 'new' || value === 'popular' ? value : 'recent';
};

const searchMessage = (status: number): string => {
  return status === 400 ? '検索条件を確認してください。' : '検索結果を取得できませんでした。';
};

export const CatalogSearch = () => {
  const [message, setMessage] = useState('作品名、別名、読み仮名、作者名から検索できます。');
  const [results, setResults] = useState<readonly SearchResult[]>([]);

  return (
    <section aria-labelledby="catalog-search-heading" className="grid gap-6">
      <h2 className="sr-only" id="catalog-search-heading">
        作品を検索
      </h2>
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const q = String(form.get('q') ?? '').trim();
          const source = String(form.get('source') ?? '').trim();
          const kind = parsePublicationKind(String(form.get('kind') ?? 'all'));
          const status = parseSerialStatus(String(form.get('status') ?? 'all'));
          const sort = parseSort(String(form.get('sort') ?? 'recent'));
          const response = await client.api.catalog.works.$get({
            query: {
              ...(kind === 'all' ? {} : { kind }),
              ...(q ? { q } : {}),
              ...(source ? { source } : {}),
              ...(status === 'all' ? {} : { status }),
              sort,
            },
          });
          if (!response.ok) {
            setMessage(searchMessage(response.status));
            setResults([]);
            return;
          }
          const data = await response.json();
          setMessage(`${data.works.length}件の公開作品が見つかりました。`);
          setResults(data.works);
        }}
      >
        <div className="md:col-span-2">
          <Field id="catalog-query" label="作品名・別名・読み仮名・作者名">
            <Input id="catalog-query" name="q" />
          </Field>
        </div>
        <Field id="catalog-source" label="掲載先キー">
          <Input id="catalog-source" name="source" />
        </Field>
        <Field id="catalog-status" label="連載状態">
          <Select defaultValue="all" id="catalog-status" name="status">
            <option value="all">すべて</option>
            <option value="ongoing">連載中</option>
            <option value="hiatus">休載</option>
            <option value="completed">完結</option>
            <option value="unknown">不明</option>
          </Select>
        </Field>
        <Field id="catalog-kind" label="掲載種別">
          <Select defaultValue="all" id="catalog-kind" name="kind">
            <option value="all">すべて</option>
            <option value="official">公式</option>
            <option value="user_submission">ユーザー投稿</option>
          </Select>
        </Field>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field id="catalog-sort" label="並び順">
              <Select defaultValue="recent" id="catalog-sort" name="sort">
                <option value="recent">最近更新</option>
                <option value="popular">人気</option>
                <option value="new">新着</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">検索</Button>
        </div>
      </form>
      <p aria-live="polite" className="text-sm text-text-muted">
        {message}
      </p>
      {results.length === 0 ? null : (
        <ul className="divide-y divide-border-subtle">
          {results.map(({ latestUpdatedAt, work }) => (
            <li className="grid gap-0.5 py-4" key={work.id}>
              <Link className="font-medium text-accent hover:underline" href={`/works/${work.id}`}>
                {work.title}
              </Link>
              <p className="text-sm text-text-muted">
                {serialStatusLabels[work.serialStatus] ?? work.serialStatus}
                {' ・ '}
                {work.creators.map((creator) => creator.name).join('、') || '作者情報なし'}
                {latestUpdatedAt ? ` ・ 最終更新 ${String(latestUpdatedAt)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
