import pg from 'pg';

// Totaload ERP — PostgreSQL connection pool (pg, no ORM). See docs/ARCHITECTURE.md §2.4, §2.7.
// DATABASE_URL is required for the backend to function; absence surfaces as connection errors
// (db:'down' in /api/health, migration failure on boot) rather than a module-load crash.

export const pool = new pg.Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Errors that won't get better with retries — fail fast so we don't compound auth lockouts
// (e.g. Supabase Supavisor's ECIRCUITBREAKER after N bad passwords) or hide misconfiguration.
function isPermanentDbError(err: unknown): boolean {
  if (typeof err !== 'object' || err == null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string') {
    // 28P01 invalid_password, 28000 invalid_authorization_specification, 3D000 invalid_catalog_name
    if (code === '28P01' || code === '28000' || code === '3D000') return true;
  }
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string') {
    if (message.includes('password authentication failed')) return true;
    if (message.includes('ECIRCUITBREAKER')) return true;
    if (message.includes('no pg_hba.conf entry')) return true;
    if (message.includes('role') && message.includes('does not exist')) return true;
  }
  return false;
}

// Wait for Postgres to accept connections, with exponential backoff. Throws after the last attempt.
// Auth / config errors short-circuit immediately (no retries) so we don't amplify lockouts.
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
      if (isPermanentDbError(err)) {
        console.error(`db connection failed with a non-retryable error — check DATABASE_URL: ${String(err)}`);
        throw new Error(`database authentication/config error: ${String(err)}`);
      }
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
