import { expect, test } from 'bun:test';

import { createVolumeIdentifier, normalizeIsbn, resolveBibliography } from './bibliography';

test('normalizes ISBN-10 and rejects invalid ISBN check digits', () => {
  expect(normalizeIsbn('4-10-100154-5')).toBe('9784101001548');
  expect(() => normalizeIsbn('9784101001544')).toThrow('check digit');
  expect(createVolumeIdentifier({ isbn: '978-4-10-100154-8', kind: 'isbn' })).toEqual({
    isbn: '9784101001548',
    kind: 'isbn',
  });
});

test('resolves each bibliography field from openBD before NDL and requires licensed covers', () => {
  const fetchedAt = new Date('2026-07-27T00:00:00Z');
  const resolved = resolveBibliography([
    {
      authors: null,
      cover: null,
      fetchedAt,
      found: true,
      isbn: '9784101001548',
      provider: 'openbd',
      publishedAt: null,
      publisher: 'openBD出版社',
      sourceUrl: 'https://api.openbd.jp/v1/get?isbn=9784101001548',
      termsUrl: 'https://openbd.jp/terms/',
      title: 'openBD題名',
    },
    {
      authors: ['NDL 著者'],
      cover: {
        licenseUrl: 'https://ndlsearch.ndl.go.jp/help/api',
        url: 'https://ndlsearch.ndl.go.jp/thumbnail/9784101001548.jpg',
      },
      fetchedAt,
      found: true,
      isbn: '9784101001548',
      provider: 'ndl',
      publishedAt: '2026-07-01',
      publisher: 'NDL 出版社',
      sourceUrl: 'https://ndlsearch.ndl.go.jp/api/sru',
      termsUrl: 'https://ndlsearch.ndl.go.jp/help/api',
      title: 'NDL題名',
    },
  ]);

  expect(resolved.title.value).toBe('openBD題名');
  expect(resolved.publisher?.value).toBe('openBD出版社');
  expect(resolved.authors.value).toEqual(['NDL 著者']);
  expect(resolved.publishedAt?.value).toBe('2026-07-01');
  expect(resolved.cover?.provider).toBe('ndl');
});
