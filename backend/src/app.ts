import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { query } from './db/pool.js';
import * as ocr from './services/ocr.js';
import { malsoRouter } from './routes/malso.js';
import { filesRouter } from './routes/files.js';

// Hanaru AI ERP — Node API. Routes for the malso flow + file serving; OCR is reached only via services/ocr.
export const app = express();

// CORS — only the configured frontend origin is allowed (PRD §7). No `cors` dependency: a few headers.
const corsOrigin = process.env.CORS_ORIGIN;
app.use((req, res, next) => {
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-Missing-Fields');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  let db: 'ok' | 'down' = 'down';
  try {
    await query('select 1');
    db = 'ok';
  } catch {
    db = 'down';
  }
  res.json({ status: 'ok', db, ocr: await ocr.health() });
});

app.use('/api/malso', malsoRouter);
app.use('/api/files', filesRouter);

// Centralised error handler — structured log, no stack traces in responses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies error handlers by 4-arg arity
const errorHandler: ErrorRequestHandler = (e, req, res, _next) => {
  if (e instanceof multer.MulterError) {
    const tooBig = e.code === 'LIMIT_FILE_SIZE';
    console.warn(JSON.stringify({ level: 'warn', msg: 'upload rejected', code: e.code, path: req.path }));
    if (res.headersSent) return;
    return res
      .status(tooBig ? 413 : 400)
      .json({ error: { code: e.code, message: tooBig ? '파일이 너무 큽니다(최대 20MB).' : '업로드 오류입니다.' } });
  }
  console.error(
    JSON.stringify({ level: 'error', msg: 'unhandled error', path: req.path, error: String((e as Error)?.message ?? e) }),
  );
  if (res.headersSent) return;
  res.status(500).json({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } });
};
app.use(errorHandler);
