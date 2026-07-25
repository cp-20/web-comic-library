export const policyDecisions = ['unreviewed', 'allowed', 'denied'] as const;

export type PolicyDecision = (typeof policyDecisions)[number];

export const sourcePolicyEvidenceKinds = ['terms', 'robots', 'api', 'feed', 'inquiry'] as const;

export type SourcePolicyEvidenceKind = (typeof sourcePolicyEvidenceKinds)[number];

export const ageRatingDispositions = ['public', 'excluded', 'review'] as const;

export type AgeRatingDisposition = (typeof ageRatingDispositions)[number];

export type SourcePolicyEvidence = Readonly<{
  checkedAt: Date;
  id: string;
  kind: SourcePolicyEvidenceKind;
  url: string;
}>;

export type SourcePolicyRecord = Readonly<{
  advertising: PolicyDecision;
  affiliate: PolicyDecision;
  changedAt: Date;
  changedBy: string;
  collection: PolicyDecision;
  commercialUse: PolicyDecision;
  emergencyStopped: boolean;
  evidence: readonly SourcePolicyEvidence[];
  id: string;
  revision: number;
  sourceId: string;
}>;

export type AgeRatingMapping = Readonly<{
  changedAt: Date;
  changedBy: string;
  disposition: AgeRatingDisposition;
  evidenceUrl: string;
  externalValue: string;
  id: string;
  revision: number;
  sourceId: string;
}>;

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }

  return trimmed;
};

const requireHttpUrl = (value: string, field: string): string => {
  const parsed = new URL(value);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${field} must use HTTP or HTTPS`);
  }

  return value;
};

const requireDate = (value: Date, field: string): Date => {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }

  return value;
};

const requireRevision = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('revision must be a positive safe integer');
  }

  return value;
};

export const createSourcePolicyEvidence = (input: SourcePolicyEvidence): SourcePolicyEvidence => {
  return {
    ...input,
    checkedAt: requireDate(input.checkedAt, 'checkedAt'),
    url: requireHttpUrl(input.url, 'url'),
  };
};

export const createSourcePolicyRecord = (input: SourcePolicyRecord): SourcePolicyRecord => {
  const changedAt = requireDate(input.changedAt, 'changedAt');
  const evidence = input.evidence.map(createSourcePolicyEvidence);
  const reviewed =
    input.collection !== 'unreviewed' ||
    input.commercialUse !== 'unreviewed' ||
    input.advertising !== 'unreviewed' ||
    input.affiliate !== 'unreviewed' ||
    input.emergencyStopped;

  if (reviewed && evidence.length === 0) {
    throw new Error('reviewed policy must include evidence');
  }

  if (input.collection === 'allowed' && !evidence.some((item) => item.kind !== 'robots')) {
    throw new Error('robots evidence alone cannot allow collection');
  }

  if (evidence.some((item) => item.checkedAt > changedAt)) {
    throw new Error('evidence cannot be checked after the policy change');
  }

  return {
    ...input,
    changedAt,
    changedBy: requireText(input.changedBy, 'changedBy'),
    evidence,
    revision: requireRevision(input.revision),
  };
};

export const createAgeRatingMapping = (input: AgeRatingMapping): AgeRatingMapping => {
  return {
    ...input,
    changedAt: requireDate(input.changedAt, 'changedAt'),
    changedBy: requireText(input.changedBy, 'changedBy'),
    evidenceUrl: requireHttpUrl(input.evidenceUrl, 'evidenceUrl'),
    externalValue: requireText(input.externalValue, 'externalValue'),
    revision: requireRevision(input.revision),
  };
};

export const canCollectSource = (policy: SourcePolicyRecord | null): boolean => {
  return policy?.collection === 'allowed' && !policy.emergencyStopped;
};

export const canExposeAgeRating = (
  policy: SourcePolicyRecord | null,
  mapping: AgeRatingMapping | null,
): boolean => {
  if (!canCollectSource(policy) || !policy || !mapping) {
    return false;
  }

  return mapping.sourceId === policy.sourceId && mapping.disposition === 'public';
};
