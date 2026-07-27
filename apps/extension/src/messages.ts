export type ContentScriptMessage = Readonly<{ type: 'favorites:extract' }>;

export type ContentScriptResponse = Readonly<{
  favorites: readonly Readonly<{
    canonicalUrl: string;
    externalWorkId: string | null;
    sourceKey: string;
    title: string;
  }>[];
}>;

export const isContentScriptMessage = (value: unknown): value is ContentScriptMessage =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === 'favorites:extract';

const isFavorite = (value: unknown): value is ContentScriptResponse['favorites'][number] =>
  typeof value === 'object' &&
  value !== null &&
  'canonicalUrl' in value &&
  typeof value.canonicalUrl === 'string' &&
  'externalWorkId' in value &&
  (typeof value.externalWorkId === 'string' || value.externalWorkId === null) &&
  'sourceKey' in value &&
  typeof value.sourceKey === 'string' &&
  'title' in value &&
  typeof value.title === 'string';

export const isContentScriptResponse = (value: unknown): value is ContentScriptResponse =>
  typeof value === 'object' &&
  value !== null &&
  'favorites' in value &&
  Array.isArray(value.favorites) &&
  value.favorites.every(isFavorite);

export type SitePermissionMessage = Readonly<{
  origin: string;
  type: 'favorites:request-site-permission';
}>;

export const isSitePermissionMessage = (value: unknown): value is SitePermissionMessage =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === 'favorites:request-site-permission' &&
  'origin' in value &&
  typeof value.origin === 'string';
