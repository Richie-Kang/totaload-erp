import { describe, it, expect, afterAll } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { pool, query } from '../src/db/pool';

const hasDb = Boolean(process.env.DATABASE_URL);

// Requires a reachable Postgres (DATABASE_URL); otherwise skipped (no hard failure).
describe.skipIf(!hasDb)('runMigrations', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('is idempotent and creates the expected tables and indexes', async () => {
    await runMigrations();
    await runMigrations(); // second run must not error

    const vehicles = await query<{ reg: string | null }>("select to_regclass('vehicles') as reg");
    const documents = await query<{ reg: string | null }>("select to_regclass('documents') as reg");
    expect(vehicles.rows[0].reg).not.toBeNull();
    expect(documents.rows[0].reg).not.toBeNull();

    const expectedIndexes = [
      'vehicles_reg_no_norm_idx',
      'vehicles_vin_norm_idx',
      'vehicles_updated_at_idx',
      'documents_vehicle_id_idx',
      'vehicles_vin_uniq',
    ];
    const found = await query<{ indexname: string }>(
      'select indexname from pg_indexes where schemaname = $1 and indexname = any($2)',
      ['public', expectedIndexes],
    );
    expect(found.rows.map((r) => r.indexname).sort()).toEqual([...expectedIndexes].sort());
  });
});
