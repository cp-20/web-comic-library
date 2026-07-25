import { describe, expect, test } from 'bun:test';

import { readConnectorFixture } from './fixture';

describe('connector fixtures', () => {
  test('loads minimal HTML, Atom, and embedded JSON without binary content', async () => {
    const [html, atom, embeddedJson] = await Promise.all([
      readConnectorFixture('publication.html'),
      readConnectorFixture('feed.xml'),
      readConnectorFixture('embedded.json'),
    ]);

    expect(html).toContain('data-publication-id');
    expect(atom).toContain('<feed');
    expect(JSON.parse(embeddedJson)).toEqual({
      publication: { id: 'fixture-publication', title: 'Fixture publication' },
    });
    expect(`${html}${atom}${embeddedJson}`).not.toContain('data:image/');
  });

  test('rejects path traversal and unsupported fixture types', async () => {
    await expect(readConnectorFixture('../secret.json')).rejects.toThrow('invalid');
    await expect(readConnectorFixture('page.png')).rejects.toThrow('invalid');
  });
});
