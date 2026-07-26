import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { isContentScriptMessage, type ContentScriptResponse } from '../src/messages';

export default defineContentScript({
  matches: [
    'https://shonenjumpplus.com/*',
    'https://comic-days.com/*',
    'https://tonarinoyj.jp/*',
    'https://seiga.nicovideo.jp/*',
    'https://comic-walker.com/*',
    'https://kadocomi.com/*',
  ],
  registration: 'runtime',
  main() {
    browser.runtime.onMessage.addListener((message: unknown): ContentScriptResponse | false => {
      if (!isContentScriptMessage(message)) return false;
      return { favorites: [] };
    });
  },
});
