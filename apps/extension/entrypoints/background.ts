import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { isSitePermissionMessage } from '../src/messages';
import { favoriteSiteOrigins, isFavoriteSiteOrigin } from '../src/site-permissions';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isSitePermissionMessage(message)) {
      return false;
    }
    if (!isFavoriteSiteOrigin(message.origin)) return Promise.resolve(false);
    return browser.permissions.request({ origins: [message.origin] });
  });

  void browser.storage.local.set({ allowedFavoriteSiteOrigins: favoriteSiteOrigins });
});
