import type { OgImageStorage, ProfileIconStorage } from '@web-comic-library/application';

export interface R2ObjectClient {
  objectExists(key: string): Promise<boolean>;
  putObject(
    input: Readonly<{
      body: Uint8Array;
      contentType: 'image/png' | 'image/svg+xml';
      key: string;
    }>,
  ): Promise<void>;
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type R2ObjectClientOptions = Readonly<{
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  fetchImplementation?: FetchImplementation;
  secretAccessKey: string;
}>;

export type R2ProfileIconStorageOptions = Readonly<{
  client: R2ObjectClient;
  publicBaseUrl: string;
}>;

export type R2OgImageStorageOptions = Readonly<{
  client: R2ObjectClient;
  publicBaseUrl: string;
}>;

export class R2ProfileIconStorage implements ProfileIconStorage {
  readonly #client: R2ObjectClient;
  readonly #publicBaseUrl: URL;

  constructor(options: R2ProfileIconStorageOptions) {
    this.#client = options.client;
    this.#publicBaseUrl = new URL(options.publicBaseUrl);
    if (this.#publicBaseUrl.protocol !== 'https:') {
      throw new Error('R2 profile icon public base URL must use HTTPS');
    }
  }

  async put(userUuid: string, contentType: 'image/png', bytes: Uint8Array): Promise<string> {
    if (!/^[0-9a-f-]{36}$/u.test(userUuid)) throw new Error('profile icon user ID must be a UUID');
    const key = `profile-icons/${userUuid}.png`;
    await this.#client.putObject({ body: bytes, contentType, key });
    return new URL(key, this.#publicBaseUrl).href;
  }
}

export const createR2ProfileIconStorage = (
  options: R2ProfileIconStorageOptions,
): R2ProfileIconStorage => new R2ProfileIconStorage(options);

export class R2OgImageStorage implements OgImageStorage {
  readonly #client: R2ObjectClient;
  readonly #publicBaseUrl: URL;

  constructor(options: R2OgImageStorageOptions) {
    this.#client = options.client;
    this.#publicBaseUrl = new URL(options.publicBaseUrl);
    if (this.#publicBaseUrl.protocol !== 'https:') {
      throw new Error('R2 OG image public base URL must use HTTPS');
    }
  }

  async putIfAbsent(key: string, contentType: 'image/svg+xml', bytes: Uint8Array): Promise<string> {
    if (!/^og-images\/[a-z0-9-]+\.svg$/u.test(key)) throw new Error('OG image key is invalid');
    if (!(await this.#client.objectExists(key))) {
      await this.#client.putObject({ body: bytes, contentType, key });
    }
    return new URL(key, this.#publicBaseUrl).href;
  }
}

export const createR2OgImageStorage = (options: R2OgImageStorageOptions): R2OgImageStorage =>
  new R2OgImageStorage(options);

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

const asArrayBuffer = (value: Uint8Array): ArrayBuffer => Uint8Array.from(value).buffer;

const sha256 = async (value: Uint8Array | string): Promise<string> =>
  hex(
    await crypto.subtle.digest(
      'SHA-256',
      asArrayBuffer(typeof value === 'string' ? encoder.encode(value) : value),
    ),
  );

const hmac = async (key: Uint8Array, value: string): Promise<Uint8Array<ArrayBuffer>> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    asArrayBuffer(key),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
};

const dateParts = (now: Date): Readonly<{ amzDate: string; dateStamp: string }> => {
  const iso = now
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

export class R2S3ObjectClient implements R2ObjectClient {
  readonly #accessKeyId: string;
  readonly #bucket: string;
  readonly #endpoint: URL;
  readonly #fetch: FetchImplementation;
  readonly #secretAccessKey: string;

  constructor(options: R2ObjectClientOptions) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(options.bucket)) {
      throw new Error('R2 bucket name is invalid');
    }
    this.#endpoint = new URL(options.endpoint);
    if (
      this.#endpoint.protocol !== 'https:' ||
      this.#endpoint.username ||
      this.#endpoint.password
    ) {
      throw new Error('R2 endpoint must be an HTTPS URL without credentials');
    }
    this.#accessKeyId = options.accessKeyId;
    this.#bucket = options.bucket;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#secretAccessKey = options.secretAccessKey;
  }

  async putObject(
    input: Readonly<{ body: Uint8Array; contentType: 'image/png' | 'image/svg+xml'; key: string }>,
  ): Promise<void> {
    const now = new Date();
    const { amzDate, dateStamp } = dateParts(now);
    const objectPath = `/${this.#bucket}/${input.key.split('/').map(encodeURIComponent).join('/')}`;
    const url = new URL(objectPath, this.#endpoint);
    const body = Uint8Array.from(input.body);
    const payloadHash = await sha256(body);
    const canonicalHeaders =
      `content-type:${input.contentType}\n` +
      `host:${url.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'PUT',
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256(canonicalRequest),
    ].join('\n');
    const dateKey = await hmac(encoder.encode(`AWS4${this.#secretAccessKey}`), dateStamp);
    const regionKey = await hmac(dateKey, 'auto');
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    const signature = hex((await hmac(signingKey, stringToSign)).buffer);
    const response = await this.#fetch(url, {
      body: body.buffer,
      headers: {
        authorization:
          `AWS4-HMAC-SHA256 Credential=${this.#accessKeyId}/${credentialScope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'content-type': input.contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      method: 'PUT',
    });
    if (!response.ok) throw new Error(`R2 object upload failed with status ${response.status}`);
  }

  async objectExists(key: string): Promise<boolean> {
    const now = new Date();
    const { amzDate, dateStamp } = dateParts(now);
    const objectPath = `/${this.#bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const url = new URL(objectPath, this.#endpoint);
    const payloadHash = await sha256('');
    const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'HEAD',
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256(canonicalRequest),
    ].join('\n');
    const dateKey = await hmac(encoder.encode(`AWS4${this.#secretAccessKey}`), dateStamp);
    const regionKey = await hmac(dateKey, 'auto');
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    const signature = hex((await hmac(signingKey, stringToSign)).buffer);
    const response = await this.#fetch(url, {
      headers: {
        authorization:
          `AWS4-HMAC-SHA256 Credential=${this.#accessKeyId}/${credentialScope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      method: 'HEAD',
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`R2 object lookup failed with status ${response.status}`);
    return true;
  }
}

export const createR2ObjectClient = (options: R2ObjectClientOptions): R2S3ObjectClient =>
  new R2S3ObjectClient(options);
