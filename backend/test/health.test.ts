import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

afterAll(async () => {
  await pool.end();
});

describe('GET /api/health', () => {
  it('returns ok and a db status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(['ok', 'down']).toContain(res.body.db);
  });
});
