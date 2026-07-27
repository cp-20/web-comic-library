export const favoriteSiteOrigins = [
  'https://shonenjumpplus.com/*',
  'https://comic-days.com/*',
  'https://tonarinoyj.jp/*',
  'https://seiga.nicovideo.jp/*',
  'https://comic-walker.com/*',
  'https://kadocomi.com/*',
] as const;

export type FavoriteSiteOrigin = (typeof favoriteSiteOrigins)[number];

export const isFavoriteSiteOrigin = (origin: string): origin is FavoriteSiteOrigin =>
  favoriteSiteOrigins.some((siteOrigin) => siteOrigin === origin);

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
