import { expect, test } from 'bun:test';

import { favoriteSiteOrigins, isFavoriteSiteOrigin } from './site-permissions';

test('allows only the declared favorite site origins', () => {
  expect(favoriteSiteOrigins).not.toContain('<all_urls>');
  expect(isFavoriteSiteOrigin('https://shonenjumpplus.com/*')).toBe(true);
  expect(isFavoriteSiteOrigin('https://example.test/*')).toBe(false);
});
