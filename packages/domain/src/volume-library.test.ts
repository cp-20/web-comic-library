import { expect, test } from 'bun:test';

import {
  confirmedVolumeContentUnitIds,
  createUserVolumeRecord,
  createVolumeContentMappingCorrection,
} from './volume-library';

test('volume records preserve independent paper and digital ownership', () => {
  expect(
    createUserVolumeRecord({
      memoContentUnitId: 'unit-3',
      ownsDigital: true,
      ownsPaper: true,
      status: 'read',
      userUuid: 'reader',
      visibility: 'private',
      volumeEditionId: 'volume-1',
      workId: 'work-1',
    }),
  ).toMatchObject({ ownsDigital: true, ownsPaper: true, status: 'read' });
});

test('only confirmed volume mappings are eligible for Web-read reflection', () => {
  expect(
    confirmedVolumeContentUnitIds([
      { confirmed: true, contentUnitId: 'unit-1' },
      { confirmed: false, contentUnitId: 'unit-2' },
      { confirmed: true, contentUnitId: 'unit-1' },
    ]),
  ).toEqual(['unit-1']);
});

test('volume mapping correction requires a concrete rationale', () => {
  expect(() =>
    createVolumeContentMappingCorrection({
      contentUnitId: 'unit-1',
      rationale: ' ',
      suggestedStatus: 'confirmed',
      userUuid: 'reader',
      volumeEditionId: 'volume-1',
    }),
  ).toThrow('correction rationale must not be empty');
});
