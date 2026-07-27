import { browser } from 'wxt/browser';

import { isContentScriptResponse } from './messages';
import { normalizeFavoriteCanonicalUrl } from './site-permissions';

type ExtensionStorage = Readonly<{ apiOrigin: string; extensionToken: string }>;

const statusElement = document.querySelector<HTMLParagraphElement>('#status');
const pairingForm = document.querySelector<HTMLFormElement>('#pairing-form');
const importButton = document.querySelector<HTMLButtonElement>('#import-favorites');

const setStatus = (message: string): void => {
  if (statusElement) statusElement.textContent = message;
};

const normalizeApiOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const isTokenResponse = (value: unknown): value is Readonly<{ token: string }> =>
  typeof value === 'object' &&
  value !== null &&
  'token' in value &&
  typeof value.token === 'string';

const isImportResponse = (value: unknown): value is Readonly<{ confirmationUrl: string }> =>
  typeof value === 'object' &&
  value !== null &&
  'confirmationUrl' in value &&
  typeof value.confirmationUrl === 'string';

const currentStorage = async (): Promise<ExtensionStorage | null> => {
  const stored = await browser.storage.local.get(['apiOrigin', 'extensionToken']);
  return typeof stored.apiOrigin === 'string' && typeof stored.extensionToken === 'string'
    ? { apiOrigin: stored.apiOrigin, extensionToken: stored.extensionToken }
    : null;
};

pairingForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const form = new FormData(pairingForm);
    const apiOrigin = normalizeApiOrigin(String(form.get('webOrigin') ?? ''));
    const code = String(form.get('pairingCode') ?? '').trim();
    if (!apiOrigin || !code) {
      setStatus('WebのURLとpairing codeを確認してください。');
      return;
    }
    const response = await fetch(`${apiOrigin}/api/extension/pairing-codes/exchange`, {
      body: JSON.stringify({ code, deviceLabel: 'browser extension' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result: unknown = await response.json();
    if (!response.ok || !isTokenResponse(result)) {
      setStatus('連携できませんでした。codeの有効期限を確認してください。');
      return;
    }
    await browser.storage.local.set({ apiOrigin, extensionToken: result.token });
    setStatus('連携しました。お気に入りを確認できます。');
  })();
});

importButton?.addEventListener('click', () => {
  void (async () => {
    const stored = await currentStorage();
    if (!stored) {
      setStatus('先にpairing codeで連携してください。');
      return;
    }
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      setStatus('表示中のサイトを取得できませんでした。');
      return;
    }
    const currentUrl = normalizeFavoriteCanonicalUrl(tab.url);
    if (!currentUrl) {
      setStatus('対応するサイトのタブを開いてください。');
      return;
    }
    const permission = await browser.runtime.sendMessage({
      origin: `${new URL(currentUrl).origin}/*`,
      type: 'favorites:request-site-permission',
    });
    if (!permission) {
      setStatus('このサイトへのアクセス許可が必要です。');
      return;
    }
    const extracted: unknown = await browser.tabs.sendMessage(tab.id, {
      type: 'favorites:extract',
    });
    if (!isContentScriptResponse(extracted)) {
      setStatus('お気に入りの応答を検証できませんでした。');
      return;
    }
    const favorites = extracted.favorites.flatMap((favorite) => {
      const canonicalUrl = normalizeFavoriteCanonicalUrl(favorite.canonicalUrl);
      return canonicalUrl ? [{ ...favorite, canonicalUrl }] : [];
    });
    if (favorites.length === 0) {
      setStatus('取り込めるお気に入りがありません。');
      return;
    }
    const response = await fetch(`${stored.apiOrigin}/api/extension/favorite-imports`, {
      body: JSON.stringify({ favorites }),
      headers: {
        authorization: `Bearer ${stored.extensionToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    const result: unknown = await response.json();
    if (!response.ok || !isImportResponse(result)) {
      setStatus('import batchを作成できませんでした。');
      return;
    }
    await browser.tabs.create({ url: result.confirmationUrl });
    setStatus('確認画面を開きました。');
  })();
});
