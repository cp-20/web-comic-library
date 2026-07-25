import type { ConnectorFailureCode, FetchResourceState } from '@web-comic-library/application';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const prohibitedPath = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\/)/i;

export class ConnectorHttpError extends Error {
  readonly code: ConnectorFailureCode;
  readonly status: number | null;

  constructor(code: ConnectorFailureCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'ConnectorHttpError';
    this.code = code;
    this.status = status;
  }
}

type Sleep = (milliseconds: number) => Promise<void>;

type SchedulerOptions = Readonly<{
  jitterMs: number;
  minIntervalMs: number;
  now: () => number;
  random: () => number;
  sleep: Sleep;
}>;

export class HostRequestScheduler {
  readonly #lastStartedAt = new Map<string, number>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #options: SchedulerOptions;

  constructor(options: SchedulerOptions) {
    this.#options = options;
  }

  async schedule<Result>(host: string, request: () => Promise<Result>): Promise<Result> {
    const previous = this.#tails.get(host) ?? Promise.resolve();
    const current = Promise.withResolvers<void>();
    this.#tails.set(host, current.promise);
    await previous;

    try {
      const lastStartedAt = this.#lastStartedAt.get(host);

      if (lastStartedAt !== undefined) {
        const jitter = Math.floor(this.#options.random() * (this.#options.jitterMs + 1));
        const waitUntil = lastStartedAt + this.#options.minIntervalMs + jitter;
        const waitMs = Math.max(0, waitUntil - this.#options.now());

        if (waitMs > 0) {
          await this.#options.sleep(waitMs);
        }
      }

      this.#lastStartedAt.set(host, this.#options.now());
      return await request();
    } finally {
      current.resolve();

      if (this.#tails.get(host) === current.promise) {
        this.#tails.delete(host);
      }
    }
  }
}

export type ConnectorFetchInput = Readonly<{
  acceptedContentTypes: readonly string[];
  sourceId: string;
  state: FetchResourceState | null;
  url: string;
}>;

export type ConnectorFetchResult =
  | Readonly<{
      body: Uint8Array;
      state: FetchResourceState;
      status: 'modified';
    }>
  | Readonly<{
      state: FetchResourceState;
      status: 'not_modified';
    }>;

export type ConnectorHttpClientOptions = Readonly<{
  allowedHosts: readonly string[];
  baseBackoffMs?: number;
  jitterMs?: number;
  maxAttempts?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
  minIntervalMs?: number;
  now?: () => number;
  random?: () => number;
  sleep?: Sleep;
  timeoutMs?: number;
}>;

type TimedResponse = Readonly<{
  cleanup: () => void;
  response: Response;
  signal: AbortSignal;
}>;

const defaultSleep: Sleep = (milliseconds) => Bun.sleep(milliseconds);

export class ConnectorHttpClient {
  readonly #allowedHosts: ReadonlySet<string>;
  readonly #baseBackoffMs: number;
  readonly #maxAttempts: number;
  readonly #maxBodyBytes: number;
  readonly #maxRedirects: number;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #scheduler: HostRequestScheduler;
  readonly #sleep: Sleep;
  readonly #timeoutMs: number;

  constructor(options: ConnectorHttpClientOptions) {
    this.#allowedHosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
    this.#baseBackoffMs = options.baseBackoffMs ?? 500;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#maxBodyBytes = options.maxBodyBytes ?? 5 * 1024 * 1024;
    this.#maxRedirects = options.maxRedirects ?? 3;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#scheduler = new HostRequestScheduler({
      jitterMs: options.jitterMs ?? 250,
      minIntervalMs: options.minIntervalMs ?? 2_000,
      now: this.#now,
      random: this.#random,
      sleep: this.#sleep,
    });

    if (this.#allowedHosts.size === 0) {
      throw new Error('allowedHosts must not be empty');
    }
  }

  async get(input: ConnectorFetchInput): Promise<ConnectorFetchResult> {
    if (input.acceptedContentTypes.length === 0) {
      throw new Error('acceptedContentTypes must not be empty');
    }

    if (input.acceptedContentTypes.some((contentType) => contentType.startsWith('image/'))) {
      throw new ConnectorHttpError('prohibited_resource', 'image content types are not allowed');
    }

    const headers = new Headers({
      Accept: input.acceptedContentTypes.join(', '),
      'User-Agent': 'web-comic-library-connector/1',
    });

    if (input.state?.etag) {
      headers.set('If-None-Match', input.state.etag);
    }

    if (input.state?.lastModified) {
      headers.set('If-Modified-Since', input.state.lastModified);
    }

    for (let attempt = 0; attempt < this.#maxAttempts; attempt += 1) {
      let timed: TimedResponse;

      try {
        // oxlint-disable-next-line no-await-in-loop -- A retry observes the previous response.
        timed = await this.#fetchFollowingRedirects(input.url, headers);
      } catch (error) {
        if (this.#isTransient(error) && attempt + 1 < this.#maxAttempts) {
          // oxlint-disable-next-line no-await-in-loop -- Backoff orders sequential attempts.
          await this.#sleep(this.#backoffDelay(attempt));
          continue;
        }

        throw error;
      }

      try {
        if (timed.response.status === 304) {
          if (!input.state) {
            throw new ConnectorHttpError('http_status', 'received 304 without prior state', 304);
          }

          // oxlint-disable-next-line no-await-in-loop -- The response must close before returning.
          await timed.response.body?.cancel();
          return {
            state: {
              ...input.state,
              checkedAt: new Date(this.#now()),
              etag: timed.response.headers.get('etag') ?? input.state.etag,
              lastModified: timed.response.headers.get('last-modified') ?? input.state.lastModified,
            },
            status: 'not_modified',
          };
        }

        if (timed.response.status === 429 || timed.response.status >= 500) {
          if (attempt + 1 < this.#maxAttempts) {
            const delay = this.#retryDelay(timed.response, attempt);
            // oxlint-disable-next-line no-await-in-loop -- The response must close before retrying.
            await timed.response.body?.cancel();
            timed.cleanup();
            // oxlint-disable-next-line no-await-in-loop -- Retry-After orders sequential attempts.
            await this.#sleep(delay);
            continue;
          }

          throw new ConnectorHttpError(
            timed.response.status === 429 ? 'rate_limited' : 'http_status',
            `HTTP ${timed.response.status}`,
            timed.response.status,
          );
        }

        if (
          input.state &&
          (input.state.sourceId !== input.sourceId || input.state.url !== input.url)
        ) {
          throw new Error('fetch state must belong to the requested source and URL');
        }

        if (!timed.response.ok) {
          throw new ConnectorHttpError(
            'http_status',
            `HTTP ${timed.response.status}`,
            timed.response.status,
          );
        }

        this.#validateContentType(timed.response, input.acceptedContentTypes);
        // oxlint-disable-next-line no-await-in-loop -- Only the accepted final attempt is consumed.
        const body = await this.#readBody(timed);
        const bodyHash = new Bun.CryptoHasher('sha256').update(body).digest('hex');

        return {
          body,
          state: {
            bodyHash,
            checkedAt: new Date(this.#now()),
            etag: timed.response.headers.get('etag'),
            lastModified: timed.response.headers.get('last-modified'),
            sourceId: input.sourceId,
            url: input.url,
          },
          status: 'modified',
        };
      } catch (error) {
        if (this.#isTransient(error) && attempt + 1 < this.#maxAttempts) {
          // oxlint-disable-next-line no-await-in-loop -- Backoff orders sequential attempts.
          await this.#sleep(this.#backoffDelay(attempt));
          continue;
        }

        throw error;
      } finally {
        timed.cleanup();
      }
    }

    throw new ConnectorHttpError('network', 'request attempts exhausted');
  }

  async #fetchFollowingRedirects(url: string, headers: Headers): Promise<TimedResponse> {
    let current = this.#validateUrl(url);

    for (let redirects = 0; ; redirects += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each redirect determines the next URL.
      const timed = await this.#fetchOnce(current, headers);

      if (!redirectStatuses.has(timed.response.status)) {
        return timed;
      }

      const location = timed.response.headers.get('location');
      // oxlint-disable-next-line no-await-in-loop -- The response must close before following Location.
      await timed.response.body?.cancel();
      timed.cleanup();

      if (!location || redirects >= this.#maxRedirects) {
        throw new ConnectorHttpError('redirect', 'redirect limit exceeded');
      }

      current = this.#validateUrl(new URL(location, current).href);
    }
  }

  #validateUrl(value: string): URL {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new ConnectorHttpError('disallowed_host', `invalid URL: ${value}`);
    }

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      !this.#allowedHosts.has(url.host)
    ) {
      throw new ConnectorHttpError('disallowed_host', `host is not allowed: ${url.host}`);
    }

    if (prohibitedPath.test(url.pathname)) {
      throw new ConnectorHttpError('prohibited_resource', `image URL is not allowed: ${url.href}`);
    }

    return url;
  }

  async #fetchOnce(url: URL, headers: Headers): Promise<TimedResponse> {
    return this.#scheduler.schedule(url.host, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const response = await Bun.fetch(url, {
          headers,
          redirect: 'manual',
          signal: controller.signal,
        });

        return {
          cleanup: () => clearTimeout(timeout),
          response,
          signal: controller.signal,
        };
      } catch (error) {
        clearTimeout(timeout);

        if (controller.signal.aborted) {
          throw new ConnectorHttpError('timeout', `request timed out: ${url.href}`);
        }

        throw new ConnectorHttpError(
          'network',
          error instanceof Error ? error.message : 'network request failed',
        );
      }
    });
  }

  #validateContentType(response: Response, accepted: readonly string[]): void {
    const contentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();

    if (!contentType || !accepted.some((candidate) => candidate.toLowerCase() === contentType)) {
      void response.body?.cancel();
      throw new ConnectorHttpError(
        'content_type',
        `unexpected Content-Type: ${contentType ?? 'missing'}`,
        response.status,
      );
    }
  }

  async #readBody(timed: TimedResponse): Promise<Uint8Array> {
    const contentLength = Number(timed.response.headers.get('content-length'));

    if (Number.isFinite(contentLength) && contentLength > this.#maxBodyBytes) {
      await timed.response.body?.cancel();
      throw new ConnectorHttpError('body_too_large', 'response body exceeds the limit');
    }

    if (!timed.response.body) {
      return new Uint8Array();
    }

    const reader = timed.response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- Streaming enforces the size limit per chunk.
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        size += chunk.value.byteLength;

        if (size > this.#maxBodyBytes) {
          // oxlint-disable-next-line no-await-in-loop -- Cancellation stops the current stream immediately.
          await reader.cancel();
          throw new ConnectorHttpError('body_too_large', 'response body exceeds the limit');
        }

        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof ConnectorHttpError) {
        throw error;
      }

      throw new ConnectorHttpError(
        timed.signal.aborted ? 'timeout' : 'network',
        timed.signal.aborted ? 'response body timed out' : 'response body was interrupted',
      );
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return body;
  }

  #retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('retry-after');

    if (retryAfter) {
      const seconds = Number(retryAfter);

      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1_000;
      }

      const timestamp = Date.parse(retryAfter);

      if (!Number.isNaN(timestamp)) {
        return Math.max(0, timestamp - this.#now());
      }
    }

    return this.#backoffDelay(attempt);
  }

  #backoffDelay(attempt: number): number {
    const jitter = Math.floor(this.#random() * this.#baseBackoffMs);
    return this.#baseBackoffMs * 2 ** attempt + jitter;
  }

  #isTransient(error: unknown): boolean {
    return (
      error instanceof ConnectorHttpError && (error.code === 'network' || error.code === 'timeout')
    );
  }
}

export const createConnectorHttpClient = (
  options: ConnectorHttpClientOptions,
): ConnectorHttpClient => {
  return new ConnectorHttpClient(options);
};
