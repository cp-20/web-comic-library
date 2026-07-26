import { expect, test } from 'bun:test';

import { parseNdlSruResponse, parseOpenBdResponse } from './bibliography';
import { readConnectorFixture } from './fixture';
import { ConnectorValidationError } from './validation';

const isbn = '9784101001548';
const fetchedAt = new Date('2026-07-27T00:00:00Z');

test('parses the minimal openBD fixture and retains a cover only with explicit terms', async () => {
  const body: unknown = JSON.parse(await readConnectorFixture('openbd-bibliography.json'));
  const record = parseOpenBdResponse(body, isbn, fetchedAt);

  expect(record).toMatchObject({
    authors: ['書誌テスト著者'],
    cover: {
      licenseUrl: 'https://publisher.example/cover-terms',
      url: 'https://publisher.example/covers/9784101001548.jpg',
    },
    found: true,
    provider: 'openbd',
    publishedAt: '2026-07-01',
    publisher: '書誌テスト出版社',
    title: '書誌テスト単行本',
  });
});

test('validates openBD responses and represents its null item as a deletion', () => {
  expect(parseOpenBdResponse([null], isbn, fetchedAt)).toMatchObject({ found: false });
  expect(() => parseOpenBdResponse({}, isbn, fetchedAt)).toThrow(ConnectorValidationError);
  expect(() =>
    parseOpenBdResponse(
      [
        {
          hanmoto: {
            cover: 'http://publisher.example/cover.jpg',
            coverLicenseUrl: 'https://publisher.example/terms',
          },
          onix: { DescriptiveDetail: { TitleDetail: { TitleText: 'unsafe cover' } } },
        },
      ],
      isbn,
      fetchedAt,
    ),
  ).toThrow(ConnectorValidationError);
});

test('parses the NDL fixture and represents zero records as missing', async () => {
  const xml = await readConnectorFixture('ndl-bibliography.xml');
  const record = parseNdlSruResponse(xml, isbn, fetchedAt);

  expect(record).toMatchObject({
    authors: ['NDL補完著者'],
    cover: null,
    found: true,
    provider: 'ndl',
    publishedAt: '2026-07-01',
    publisher: 'NDL補完出版社',
    title: 'NDL補完書名',
  });
  expect(
    parseNdlSruResponse(
      '<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>',
      isbn,
      fetchedAt,
    ),
  ).toMatchObject({ found: false });
});
