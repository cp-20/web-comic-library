'use client';

import { useEffect, useState } from 'react';

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
    <section aria-label="共有">
      <button onClick={() => void share()} type="button">
        共有
      </button>
      <a
        href={socialUrl('https://x.com/intent/post?url=', absoluteUrl, title)}
        rel="noreferrer"
        target="_blank"
      >
        X
      </a>{' '}
      <a
        href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${absoluteUrl}`)}`}
        rel="noreferrer"
        target="_blank"
      >
        Bluesky
      </a>{' '}
      <a
        href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(absoluteUrl)}`}
        rel="noreferrer"
        target="_blank"
      >
        LINE
      </a>
      {message ? <output>{message}</output> : null}
    </section>
  );
};
