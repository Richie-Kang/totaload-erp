import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, waitForDb } from './pool.js';

// Hanaru AI ERP — idempotent schema migration. Runs backend/src/db/schema.sql in one transaction.
// Safe to call repeatedly (schema.sql uses CREATE ... IF NOT EXISTS). See docs/ARCHITECTURE.md §2.4.

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export async function runMigrations(): Promise<void> {
  await waitForDb();
  const sql = readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw new Error(`migration failed: ${String(err)}`);
  } finally {
    client.release();
  }
}
