export const favoriteSiteOrigins = [
  'https://shonenjumpplus.com/*',
  'https://comic-days.com/*',
  'https://tonarinoyj.jp/*',
  'https://seiga.nicovideo.jp/*',
  'https://comic-walker.com/*',
  'https://kadocomi.com/*',
] as const;

export type FavoriteSiteOrigin = (typeof favoriteSiteOrigins)[number];

const favoriteSourceKeys = {
  'https://comic-days.com/*': 'comic-days',
  'https://shonenjumpplus.com/*': 'shonen-jump-plus',
  'https://tonarinoyj.jp/*': 'tonari-no-young-jump',
} as const;

export type FavoriteSourceKey = (typeof favoriteSourceKeys)[keyof typeof favoriteSourceKeys];

export const isFavoriteSiteOrigin = (origin: string): origin is FavoriteSiteOrigin =>
  favoriteSiteOrigins.some((siteOrigin) => siteOrigin === origin);

export const favoriteSourceKeyForOrigin = (origin: string): FavoriteSourceKey | null =>
  Object.hasOwn(favoriteSourceKeys, origin)
    ? favoriteSourceKeys[origin as keyof typeof favoriteSourceKeys]
    : null;

export const normalizeFavoriteCanonicalUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const origin = `${url.origin}/*`;
    if (!isFavoriteSiteOrigin(origin)) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
};
