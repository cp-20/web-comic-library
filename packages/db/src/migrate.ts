import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { runMigrations } from 'graphile-worker';
import postgres from 'postgres';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export const migrateDatabase = async (databaseUrl: string): Promise<void> => {
  const client = postgres(databaseUrl, { max: 1 });

  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 1 });
  }

  await runMigrations({ connectionString: databaseUrl });
};
