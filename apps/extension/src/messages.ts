export type ContentScriptMessage = Readonly<{ type: 'favorites:extract' }>;

export type ContentScriptResponse = Readonly<{
  favorites: readonly Readonly<{
    canonicalUrl: string;
    externalWorkId: string | null;
    title: string;
  }>[];
}>;

export const isContentScriptMessage = (value: unknown): value is ContentScriptMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'favorites:extract';
