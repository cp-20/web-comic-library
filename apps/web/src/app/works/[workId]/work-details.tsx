'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
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
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold">{work.title}</h1>
            <p className="text-sm text-text-muted">連載状態: {work.serialStatus}</p>
          </div>
          <section aria-labelledby="work-creators-heading" className="grid gap-2">
            <h2 className="text-lg font-semibold" id="work-creators-heading">
              作者
            </h2>
            <ul className="grid gap-1">
              {work.creators.map((creator) => (
                <li key={creator.id}>
                  <span className="font-medium">{creator.name}</span>
                  <span className="text-sm text-text-muted">（{creator.role}）</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="work-publications-heading" className="grid gap-4">
            <h2 className="text-lg font-semibold" id="work-publications-heading">
              掲載先とWeb話
            </h2>
            <div className="divide-y divide-border-subtle">
              {work.publications.map((publication) => (
                <article className="grid gap-2 py-4 first:pt-0 last:pb-0" key={publication.id}>
                  <div className="grid gap-0.5">
                    <h3 className="font-medium">{publication.title}</h3>
                    <p className="text-sm text-text-muted">
                      {publication.sourceName} / {publication.kind}
                    </p>
                  </div>
                  <a
                    className="inline-flex w-fit items-center gap-1 text-accent hover:underline"
                    href={publication.normalizedUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    公式の閲覧ページを開く
                    <ExternalLink aria-hidden className="size-4 shrink-0" />
                  </a>
                  <ul className="grid gap-1">
                    {publication.entries.map((entry) => (
                      <li key={entry.id}>
                        <a
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                          href={entry.normalizedUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {entry.title}
                          <ExternalLink aria-hidden className="size-4 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
          <section aria-labelledby="work-volumes-heading" className="grid gap-2">
            <h2 className="text-lg font-semibold" id="work-volumes-heading">
              単行本
            </h2>
            <p>
              <Link className="text-accent hover:underline" href="/library/volumes">
                単行本ライブラリを開く
              </Link>
            </p>
            {work.volumes.length === 0 ? (
              <p className="text-sm text-text-muted">公開中の単行本情報はありません。</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {work.volumes.map((volume) => (
                  <li className="py-3" key={volume.id}>
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

  return (
    <section aria-live="polite" className="grid gap-8">
      {content}
    </section>
  );
};
