// Totaload ERP — GET /api/files/:docId: stream a stored document by id only (PRD §7, §2.8).
// File bytes live in Postgres (documents.file_bytes); fetched only on download.

import { Router } from 'express';
import * as vehicles from '../services/vehicles.js';
import { isUuid } from '../lib/validation.js';

export const filesRouter = Router();

filesRouter.get('/:docId', async (req, res, next) => {
  try {
    if (!isUuid(req.params.docId)) {
      return res.status(400).json({ error: { code: 'BAD_ID', message: '잘못된 문서 ID 입니다.' } });
    }
    const doc = await vehicles.getDocumentBytes(req.params.docId);
    if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '문서를 찾을 수 없습니다.' } });

    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.send(doc.bytes);
  } catch (e) {
    next(e);
  }
});
