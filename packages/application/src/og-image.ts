/** Stores only already-authorized, public OG renderings. */
export interface OgImageStorage {
  putIfAbsent(key: string, contentType: 'image/svg+xml', bytes: Uint8Array): Promise<string>;
}
