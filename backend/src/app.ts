import express from 'express';
import { query } from './db/pool.js';

// Totaload ERP — Node API. Routes, storage and OCR integration land in step 3.
export const app = express();

app.get('/api/health', async (_req, res) => {
  let db: 'ok' | 'down' = 'down';
  try {
    await query('select 1');
    db = 'ok';
  } catch {
    db = 'down';
  }
  res.json({ status: 'ok', db });
});
