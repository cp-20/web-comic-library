import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv[2];
const id = process.argv[3];

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client);

try {
  if (mode === 'setup') {
    const result = await database.execute<{ value: number }>(sql`select 1::int as value`);

    if (result[0]?.value !== 1) {
      throw new Error('Drizzle PostgreSQL query returned an unexpected result');
    }

    await database.execute(sql`
      create table if not exists compatibility_probe (
        id text primary key,
        processed_at timestamptz not null
      )
    `);
    await database.execute(sql`truncate compatibility_probe`);
  } else if (mode === 'assert-missing' && id) {
    const result = await database.execute<{ found: boolean }>(sql`
      select exists(
        select 1 from compatibility_probe where id = ${id}
      ) as found
    `);

    if (result[0]?.found !== false) {
      throw new Error(`job ${id} ran after the worker stopped`);
    }
  } else {
    throw new Error('usage: compatibility.ts <setup|assert-missing> [id]');
  }
} finally {
  await client.end({ timeout: 1 });
}
