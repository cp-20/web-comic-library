import { expect, test } from 'bun:test';

import {
  favoriteSiteOrigins,
  isFavoriteSiteOrigin,
  normalizeFavoriteCanonicalUrl,
} from './site-permissions';

test('allows only the declared favorite site origins', () => {
  expect(favoriteSiteOrigins).not.toContain('<all_urls>');
  expect(isFavoriteSiteOrigin('https://shonenjumpplus.com/*')).toBe(true);
  expect(isFavoriteSiteOrigin('https://example.test/*')).toBe(false);
  expect(normalizeFavoriteCanonicalUrl('https://kadocomi.com/works/1?campaign=1#episode-2')).toBe(
    'https://kadocomi.com/works/1',
  );
  expect(normalizeFavoriteCanonicalUrl('https://example.test/works/1')).toBeNull();
});
