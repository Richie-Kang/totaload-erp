import pg from 'pg';

// Totaload ERP — PostgreSQL connection pool (pg, no ORM). See docs/ARCHITECTURE.md §2.4, §2.7.
// DATABASE_URL is required for the backend to function; absence surfaces as connection errors
// (db:'down' in /api/health, migration failure on boot) rather than a module-load crash.

export const pool = new pg.Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Wait for Postgres to accept connections, with exponential backoff. Throws after the last attempt.
export async function waitForDb(maxAttempts = 10): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query('select 1');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
      console.warn(`db not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw new Error(`could not connect to database after ${maxAttempts} attempts: ${String(lastErr)}`);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}
