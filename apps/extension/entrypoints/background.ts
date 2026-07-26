import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { favoriteSiteOrigins, isFavoriteSiteOrigin } from '../src/site-permissions';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { type?: unknown }).type !== 'favorites:request-site-permission'
    ) {
      return false;
    }
    const origin = (message as { origin?: unknown }).origin;
    if (typeof origin !== 'string' || !isFavoriteSiteOrigin(origin)) return Promise.resolve(false);
    return browser.permissions.request({ origins: [origin] });
  });

  void browser.storage.local.set({ allowedFavoriteSiteOrigins: favoriteSiteOrigins });
});
