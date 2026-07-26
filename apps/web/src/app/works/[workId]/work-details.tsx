'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { createApiClient } from '../../../lib/api-client';

const client = createApiClient('');
const redirectClient = createApiClient('', {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, redirect: 'manual' }),
});

export const WorkDetails = ({ workId }: Readonly<{ workId: string }>) => {
  const [content, setContent] = useState<ReactNode>('作品情報を読み込んでいます。');

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await client.api.catalog.works[':workId'].$get({ param: { workId } });
      if (!active) return;
      if (!response.ok) {
        if (response.status === 404) {
          const redirected = await redirectClient.api.catalog.redirects[':resource'][':id'].$get({
            param: { id: workId, resource: 'work' },
          });
          const location = redirected.headers.get('location');
          if (redirected.status === 302 && location) {
            window.location.replace(location);
            return;
          }
        }
        setContent(
          response.status === 404
            ? '公開作品が見つかりません。'
            : '作品情報を取得できませんでした。',
        );
        return;
      }
      const { work } = await response.json();
      if (!active) return;
      setContent(
        <>
          <h1>{work.title}</h1>
          <p>連載状態: {work.serialStatus}</p>
          <section aria-labelledby="work-creators-heading">
            <h2 id="work-creators-heading">作者</h2>
            <ul>
              {work.creators.map((creator) => (
                <li key={creator.id}>
                  {creator.name}（{creator.role}）
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="work-publications-heading">
            <h2 id="work-publications-heading">掲載先とWeb話</h2>
            {work.publications.map((publication) => (
              <article key={publication.id}>
                <h3>{publication.title}</h3>
                <p>
                  {publication.sourceName} / {publication.kind}
                </p>
                <a href={publication.normalizedUrl} rel="noreferrer" target="_blank">
                  公式の閲覧ページを開く
                </a>
                <ul>
                  {publication.entries.map((entry) => (
                    <li key={entry.id}>
                      <a href={entry.normalizedUrl} rel="noreferrer" target="_blank">
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
          <section aria-labelledby="work-volumes-heading">
            <h2 id="work-volumes-heading">単行本</h2>
            {work.volumes.length === 0 ? (
              <p>公開中の単行本情報はありません。</p>
            ) : (
              <ul>
                {work.volumes.map((volume) => (
                  <li key={volume.id}>
                    {volume.title}
                    {volume.authors.length > 0 ? ` — ${volume.authors.join('、')}` : ''}
                    {volume.publisher ? ` / ${volume.publisher}` : ''}
                    {volume.publishedAt ? ` / ${volume.publishedAt}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>,
      );
    })().catch(() => {
      if (active) setContent('作品情報を取得できませんでした。');
    });
    return () => {
      active = false;
    };
  }, [workId]);

  return <section aria-live="polite">{content}</section>;
};
