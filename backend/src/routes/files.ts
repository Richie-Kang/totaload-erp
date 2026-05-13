// Totaload ERP — GET /api/files/:docId: stream a stored file by document id only (no user-supplied
// paths — path-traversal guard, PRD §7, §2.8).

import { Router } from 'express';
import * as storage from '../services/storage.js';
import * as vehicles from '../services/vehicles.js';
import { isUuid } from '../lib/validation.js';

export const filesRouter = Router();

filesRouter.get('/:docId', async (req, res, next) => {
  try {
    if (!isUuid(req.params.docId)) {
      return res.status(400).json({ error: { code: 'BAD_ID', message: '잘못된 문서 ID 입니다.' } });
    }
    const doc = await vehicles.getDocumentById(req.params.docId);
    if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: '문서를 찾을 수 없습니다.' } });

    let stream;
    try {
      ({ stream } = storage.openRead(doc.file_path));
    } catch (e) {
      console.error(
        JSON.stringify({ level: 'error', msg: 'document file missing', docId: doc.id, file_path: doc.file_path, error: String(e) }),
      );
      return res.status(404).json({ error: { code: 'FILE_MISSING', message: '파일을 찾을 수 없습니다.' } });
    }

    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Disposition', 'inline');
    stream.on('error', (e) => {
      console.error(JSON.stringify({ level: 'error', msg: 'file stream error', docId: doc.id, error: String(e) }));
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});
