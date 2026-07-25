import { createPostgresConnectorState, createPostgresFoundation } from '@web-comic-library/db';

const databaseUrl = process.env.DATABASE_URL;
const [mode, sourceId] = process.argv.slice(2);

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if ((mode !== 'resume' && mode !== 'status') || !sourceId) {
  throw new Error('usage: connector-command.ts <resume|status> <source-id>');
}

const foundation = createPostgresFoundation(databaseUrl);
const states = createPostgresConnectorState(databaseUrl, foundation);

try {
  const state =
    mode === 'resume'
      ? await states.resume(sourceId, new Date())
      : await states.findSourceCrawlState(sourceId);
  console.log(
    JSON.stringify({
      consecutiveFailures: state.consecutiveFailures,
      sourceId: state.sourceId,
      status: state.status,
      updatedAt: state.updatedAt.toISOString(),
    }),
  );
} finally {
  await states.close();
  await foundation.close();
}
