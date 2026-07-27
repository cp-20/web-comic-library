export const catalogAdminAssurances = ['passkey', 'two_factor'] as const;

export type CatalogAdminAssurance = 'none' | (typeof catalogAdminAssurances)[number];

export type CatalogAdminActor = Readonly<{
  assurance: CatalogAdminAssurance;
  id: string;
  role: 'administrator' | 'user';
}>;

export const isCatalogAdmin = (actor: CatalogAdminActor): boolean =>
  actor.role === 'administrator' &&
  actor.assurance !== 'none' &&
  catalogAdminAssurances.includes(actor.assurance);

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }

  return trimmed;
};

export const requireCatalogAdmin = (actor: CatalogAdminActor): CatalogAdminActor => {
  if (actor.role !== 'administrator') {
    throw new Error('catalog administration requires an administrator');
  }

  if (actor.assurance === 'none' || !catalogAdminAssurances.includes(actor.assurance)) {
    throw new Error('catalog administration requires passkey or two-factor assurance');
  }

  return {
    ...actor,
    id: requireText(actor.id, 'actor id'),
  };
};

export const requireCatalogOperationReason = (reason: string): string => {
  return requireText(reason, 'reason');
};

export const requireDistinctCatalogIds = (
  sourceId: string,
  targetId: string,
  resource: string,
): Readonly<{ sourceId: string; targetId: string }> => {
  const source = requireText(sourceId, `${resource} source id`);
  const target = requireText(targetId, `${resource} target id`);

  if (source === target) {
    throw new Error(`${resource} source and target must differ`);
  }

  return { sourceId: source, targetId: target };
};

export const requireUniqueCatalogIds = (
  ids: readonly string[],
  field: string,
): readonly string[] => {
  if (ids.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  const normalized = ids.map((id) => requireText(id, field));

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${field} must not contain duplicates`);
  }

  return normalized;
};
