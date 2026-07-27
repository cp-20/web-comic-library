import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Web Comic Library',
    optional_host_permissions: [
      'https://shonenjumpplus.com/*',
      'https://comic-days.com/*',
      'https://tonarinoyj.jp/*',
      'https://seiga.nicovideo.jp/*',
      'https://comic-walker.com/*',
      'https://kadocomi.com/*',
    ],
    permissions: ['activeTab', 'scripting', 'storage'],
    version: '0.0.0',
  },
});
