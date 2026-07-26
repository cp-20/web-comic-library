import { expect, test } from 'bun:test';

import { readConnectorFixture } from './fixture';
import { ConnectorHttpClient } from './http-client';
import {
  KadocomiConnector,
  classifyKadocomiEntry,
  kadocomiConfig,
  parseKadocomiHtmlFallback,
  parseKadocomiPublicationPage,
} from './kadocomi';
import { ConnectorValidationError } from './validation';

test('kadocomi parser reads embedded work data without truncating 127 items', async () => {
  const fixture = await readConnectorFixture('kadocomi-publication.html');
  const candidate = parseKadocomiPublicationPage(fixture, kadocomiConfig);

  expect(candidate).toMatchObject({
    ageRatingValue: 'adult',
    authorDetails: [
      { name: 'author one', role: 'manga' },
      { name: 'author two', role: 'original' },
    ],
    authors: ['author one', 'author two'],
    externalId: 'KC_000123_S',
    nextUpdateAt: new Date('2026-08-02T00:00:00.000Z'),
    serialStatus: 'ongoing',
    title: 'fixture work',
    url: 'https://comic-walker.com/detail/KC_000123_S',
  });
  expect(candidate.entries).toHaveLength(127);
  expect(new Set(candidate.entries.map((entry) => entry.externalId)).size).toBe(127);
  expect(candidate.entries[0]).toMatchObject({
    externalId: 'KC_0001230000100001_E',
    kind: 'regular',
  });
  expect(candidate.entries[1]).toMatchObject({
    externalId: 'KC_0001230000100002_E',
    kind: 'extra',
  });
  expect(candidate.entries[2]).toMatchObject({
    externalId: 'KC_0001230000100003_E',
    kind: 'announcement',
  });
  expect(candidate.entries[3]).toMatchObject({
    externalId: 'KC_0001230000100004_E',
    kind: 'unknown',
  });
  const inactive = parseKadocomiPublicationPage(
    fixture.replace('"isActive": true', '"isActive": false'),
    kadocomiConfig,
  );

  expect(inactive.entries).toHaveLength(126);
  expect(inactive.entries.some((entry) => entry.externalId === 'KC_0001230000100001_E')).toBe(
    false,
  );
});

test('kadocomi parser fails closed on broken JSON, schema changes, count drops, and unknown ratings', async () => {
  const fixture = await readConnectorFixture('kadocomi-publication.html');

  expect(() =>
    parseKadocomiPublicationPage(fixture.replace('"props"', '"changed"'), kadocomiConfig),
  ).toThrow(ConnectorValidationError);
  expect(() =>
    parseKadocomiPublicationPage(fixture.replace('"total": 127', '"total": 128'), kadocomiConfig),
  ).toThrow(ConnectorValidationError);
  expect(() =>
    parseKadocomiPublicationPage(
      fixture.replace('"ratingLevel": "adult"', '"ratingLevel": "unconfirmed"'),
      kadocomiConfig,
    ),
  ).toThrow(ConnectorValidationError);
  expect(() =>
    parseKadocomiPublicationPage(
      fixture.replace(
        '<script id="__NEXT_DATA__" type="application/json">',
        '<script id="__NEXT_DATA__" type="application/json">{',
      ),
      kadocomiConfig,
    ),
  ).toThrow(ConnectorValidationError);
});

test('kadocomi uses a limited stable HTML fallback only when embedded data is absent', () => {
  const fallback = parseKadocomiPublicationPage(
    '<link rel="canonical" href="/detail/KC_000123_S"><meta property="og:title" content="fallback work｜カドコミ">',
    kadocomiConfig,
  );

  expect(fallback).toMatchObject({
    ageRatingValue: null,
    authors: [],
    entries: [],
    externalId: 'KC_000123_S',
    title: 'fallback work',
  });
  expect(() => parseKadocomiHtmlFallback('<h1>unstable markup</h1>', kadocomiConfig)).toThrow(
    ConnectorValidationError,
  );
});

test('kadocomi connector requests only the public HTML page and never images or private APIs', async () => {
  const fixture = await readConnectorFixture('kadocomi-publication.html');
  const requests: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push(url.pathname);

      if (url.pathname === '/detail/KC_000123_S/episodes/KC_0001230000100001_E') {
        return new Response(fixture + '<img src="' + url.origin + '/images/page.jpg">', {
          headers: { 'content-type': 'text/html' },
        });
      }

      return new Response('not found', { status: 404 });
    },
  });
  const config = {
    allowedHosts: [server.url.host],
    baseUrl: server.url.origin + '/',
  };
  const connector = new KadocomiConnector(
    config,
    new ConnectorHttpClient({
      allowedHosts: config.allowedHosts,
      jitterMs: 0,
      maxAttempts: 1,
      minIntervalMs: 0,
    }),
  );

  try {
    const sourceId = crypto.randomUUID();
    const candidate = await connector.fetchPublication({
      externalId: 'KC_000123_S',
      sourceId,
      url: server.url.origin + '/detail/KC_000123_S/episodes/KC_0001230000100001_E',
    });

    expect(candidate.sourceId).toBe(sourceId);
    expect(candidate.entries).toHaveLength(127);
    expect(requests).toEqual(['/detail/KC_000123_S/episodes/KC_0001230000100001_E']);
    expect(requests.some((path) => path.startsWith('/api/') || path.startsWith('/images/'))).toBe(
      false,
    );
  } finally {
    server.stop(true);
  }
});

test('kadocomi entry types never infer a regular chapter from its title', () => {
  expect(classifyKadocomiEntry('normal')).toBe('regular');
  expect(classifyKadocomiEntry('extra')).toBe('extra');
  expect(classifyKadocomiEntry('illustration')).toBe('announcement');
  expect(classifyKadocomiEntry('not-documented')).toBe('unknown');
});
