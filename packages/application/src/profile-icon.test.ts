import { expect, test } from 'bun:test';

import { sanitizeProfileIcon } from './profile-icon';

const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 68, 65, 84, 0, 0, 0, 0, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
]);

test('only accepts bounded PNG icons and removes non-image metadata chunks', () => {
  expect(sanitizeProfileIcon({ bytes: png, contentType: 'image/png' })).toEqual(png);
  expect(() => sanitizeProfileIcon({ bytes: png, contentType: 'image/jpeg' })).toThrow('PNG');
  expect(() =>
    sanitizeProfileIcon({ bytes: png.slice(0, 20), contentType: 'image/png' }),
  ).toThrow();
});
