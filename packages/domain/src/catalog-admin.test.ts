import { expect, test } from 'bun:test';

import {
  requireCatalogAdmin,
  requireCatalogOperationReason,
  requireDistinctCatalogIds,
  requireUniqueCatalogIds,
} from './catalog-admin';

test('catalog administration requires an administrator with a strong assurance', () => {
  expect(() =>
    requireCatalogAdmin({ assurance: 'passkey', id: 'operator-1', role: 'user' }),
  ).toThrow('administrator');
  expect(
    requireCatalogAdmin({ assurance: 'two_factor', id: 'operator-1', role: 'administrator' }),
  ).toEqual({ assurance: 'two_factor', id: 'operator-1', role: 'administrator' });
});

test('catalog operations reject blank reasons, identical IDs, and duplicate selections', () => {
  expect(() => requireCatalogOperationReason('   ')).toThrow('reason');
  expect(() => requireDistinctCatalogIds('work-1', 'work-1', 'work')).toThrow('must differ');
  expect(() => requireUniqueCatalogIds(['entry-1', 'entry-1'], 'entry ids')).toThrow('duplicates');
});
