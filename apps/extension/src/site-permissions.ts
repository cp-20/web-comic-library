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
  favoriteSiteOrigins.includes(origin as FavoriteSiteOrigin);
