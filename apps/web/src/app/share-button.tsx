'use client';

import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../components/ui/button';

type ShareButtonProps = Readonly<{ title: string; url: string }>;

const socialUrl = (base: string, url: string, text: string): string =>
  `${base}${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;

export const ShareButton = ({ title, url }: ShareButtonProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const [absoluteUrl, setAbsoluteUrl] = useState(url);

  useEffect(() => {
    setAbsoluteUrl(new URL(url, window.location.origin).href);
  }, [url]);

  const share = async (): Promise<void> => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: absoluteUrl });
        return;
      }
      await navigator.clipboard.writeText(absoluteUrl);
      setMessage('URLをコピーしました。');
    } catch {
      setMessage('共有できませんでした。URLをコピーして共有してください。');
    }
  };

  return (
    <section aria-label="共有" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button onClick={() => void share()} type="button" variant="secondary">
          共有
        </Button>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline"
          href={socialUrl('https://x.com/intent/post?url=', absoluteUrl, title)}
          rel="noreferrer"
          target="_blank"
        >
          X
          <ExternalLink aria-hidden className="size-4 shrink-0" />
        </a>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline"
          href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${absoluteUrl}`)}`}
          rel="noreferrer"
          target="_blank"
        >
          Bluesky
          <ExternalLink aria-hidden className="size-4 shrink-0" />
        </a>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline"
          href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(absoluteUrl)}`}
          rel="noreferrer"
          target="_blank"
        >
          LINE
          <ExternalLink aria-hidden className="size-4 shrink-0" />
        </a>
      </div>
      {message ? <output className="text-sm text-text-muted">{message}</output> : null}
    </section>
  );
};
