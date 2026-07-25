import { parseSourcePolicyEvidenceKind } from '@web-comic-library/application';
import { createPostgresSourcePolicy } from '@web-comic-library/db';

const databaseUrl = process.env.DATABASE_URL;
const [mode, sourceId, changedBy, evidenceKindInput, evidenceUrl] = process.argv.slice(2);
const evidenceKind = parseSourcePolicyEvidenceKind(evidenceKindInput);

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if (
  (mode !== 'stop' && mode !== 'resume') ||
  !sourceId ||
  !changedBy ||
  !evidenceKind ||
  !evidenceUrl
) {
  throw new Error(
    'usage: source-policy-command.ts <stop|resume> <source-id> <changed-by> <terms|robots|api|feed|inquiry> <evidence-url>',
  );
}

const policies = createPostgresSourcePolicy(databaseUrl);
const changedAt = new Date();

try {
  await policies.setEmergencyStop({
    changedAt,
    changedBy,
    evidence: {
      checkedAt: changedAt,
      id: crypto.randomUUID(),
      kind: evidenceKind,
      url: evidenceUrl,
    },
    sourceId,
    stopped: mode === 'stop',
  });
} finally {
  await policies.close();
}
