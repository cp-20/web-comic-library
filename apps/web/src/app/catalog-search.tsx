'use client';

import Link from 'next/link';
import { useState } from 'react';

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
    <section aria-labelledby="catalog-search-heading">
      <h2 id="catalog-search-heading">作品を検索</h2>
      <form
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
        <label htmlFor="catalog-query">作品名・別名・読み仮名・作者名</label>
        <input id="catalog-query" name="q" />
        <label htmlFor="catalog-source">掲載先キー</label>
        <input id="catalog-source" name="source" />
        <label htmlFor="catalog-status">連載状態</label>
        <select defaultValue="all" id="catalog-status" name="status">
          <option value="all">すべて</option>
          <option value="ongoing">連載中</option>
          <option value="hiatus">休載</option>
          <option value="completed">完結</option>
          <option value="unknown">不明</option>
        </select>
        <label htmlFor="catalog-kind">掲載種別</label>
        <select defaultValue="all" id="catalog-kind" name="kind">
          <option value="all">すべて</option>
          <option value="official">公式</option>
          <option value="user_submission">ユーザー投稿</option>
        </select>
        <label htmlFor="catalog-sort">並び順</label>
        <select defaultValue="recent" id="catalog-sort" name="sort">
          <option value="recent">最近更新</option>
          <option value="popular">人気</option>
          <option value="new">新着</option>
        </select>
        <button type="submit">検索</button>
      </form>
      <p aria-live="polite">{message}</p>
      {results.length === 0 ? null : (
        <ul>
          {results.map(({ latestUpdatedAt, work }) => (
            <li key={work.id}>
              <Link href={`/works/${work.id}`}>{work.title}</Link>
              <span>（{work.serialStatus}）</span>
              <span>
                {' '}
                — {work.creators.map((creator) => creator.name).join('、') || '作者情報なし'}
              </span>
              {latestUpdatedAt ? <span> — 最終更新 {String(latestUpdatedAt)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
