import express from 'express';

// Totaload ERP — Node API. Routes, storage, DB and OCR integration land in steps 1–3.
export const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
