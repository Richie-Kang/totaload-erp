// Totaload ERP — /api/malso routes: upload+extract, fetch, edit, PDF generation, search (§2.3, §2.5).

import { Router, type Response } from 'express';
import multer from 'multer';
import * as ocr from '../services/ocr.js';
import * as vehicles from '../services/vehicles.js';
import { todayCompact } from '../lib/dates.js';
import { ALLOWED_UPLOAD_MIME, detectUploadMime, extForMime } from '../lib/upload.js';
import { isUuid, validateVehicleFields } from '../lib/validation.js';

export const malsoRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function err(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

const notFound = (res: Response) => err(res, 404, 'NOT_FOUND', '차량을 찾을 수 없습니다.');

// POST /api/malso — upload a registration certificate image; store it, run OCR, create the vehicle.
// OCR failure does NOT fail the request: the image and record are still created, ocrStatus reflects it.
malsoRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || file.buffer.length === 0) return err(res, 400, 'NO_FILE', '파일이 필요합니다.');
    if (!ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
      return err(res, 400, 'BAD_TYPE', 'JPG/PNG/WEBP/PDF 파일만 업로드할 수 있습니다.');
    }
    const detected = detectUploadMime(file.buffer);
    if (!detected) return err(res, 400, 'BAD_CONTENT', '파일 내용이 허용된 형식(JPG/PNG/WEBP/PDF)이 아닙니다.');

    let extracted: ocr.ExtractResult;
    try {
      extracted = await ocr.extract(file.buffer, file.originalname || `upload.${extForMime(detected)}`);
    } catch {
      extracted = ocr.failedResult();
    }

    const vehicle = await vehicles.createFromOcr(extracted);
    await vehicles.addDocument({
      vehicle_id: vehicle.id,
      kind: 'registration_cert',
      file_bytes: file.buffer,
      orig_name: file.originalname || null,
      mime: detected,
      size_bytes: file.buffer.length,
    });

    res.status(201).json({
      vehicle,
      fields: extracted.fields,
      ocrStatus: extracted.status,
      warnings: extracted.warnings,
      errorCode: extracted.errorCode,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/malso/search?q=&limit= — must be declared before /:id.
malsoRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.length > 64) return err(res, 400, 'BAD_QUERY', '검색어는 64자 이하여야 합니다.');
    let limit = 50;
    const rawLimit = req.query.limit;
    if (typeof rawLimit === 'string' && rawLimit.trim() !== '') {
      const n = Number(rawLimit);
      if (!Number.isFinite(n) || n < 1) return err(res, 400, 'BAD_LIMIT', 'limit 값이 올바르지 않습니다.');
      limit = n;
    }
    res.json(await vehicles.search(q, limit));
  } catch (e) {
    next(e);
  }
});

malsoRouter.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res);
    const result = await vehicles.getById(req.params.id);
    if (!result) return notFound(res);
    const documents = result.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      orig_name: d.orig_name,
      mime: d.mime,
      created_at: d.created_at,
      url: `/api/files/${d.id}`,
    }));
    res.json({ vehicle: result.vehicle, documents });
  } catch (e) {
    next(e);
  }
});

malsoRouter.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res);
    const fields = (req.body ?? {}).fields;
    if (fields == null || typeof fields !== 'object' || Array.isArray(fields)) {
      return err(res, 400, 'BAD_BODY', 'fields 객체가 필요합니다.');
    }
    const invalid = validateVehicleFields(fields as Record<string, unknown>);
    if (invalid) return err(res, 400, 'BAD_FIELDS', invalid);
    const vehicle = await vehicles.update(req.params.id, fields as Record<string, unknown>);
    if (!vehicle) return notFound(res);
    res.json({ vehicle });
  } catch (e) {
    next(e);
  }
});

// POST /api/malso/:id/pdf — optionally apply last edits, then build the malso application PDF.
malsoRouter.post('/:id/pdf', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res);
    const incoming = (req.body ?? {}).fields;
    if (incoming != null) {
      if (typeof incoming !== 'object' || Array.isArray(incoming)) {
        return err(res, 400, 'BAD_BODY', 'fields 는 객체여야 합니다.');
      }
      const invalid = validateVehicleFields(incoming as Record<string, unknown>);
      if (invalid) return err(res, 400, 'BAD_FIELDS', invalid);
      const updated = await vehicles.update(req.params.id, incoming as Record<string, unknown>);
      if (!updated) return notFound(res);
    }
    const result = await vehicles.getById(req.params.id);
    if (!result) return notFound(res);
    const v = result.vehicle;

    const fillValues: ocr.FillPdfValues = {
      owner_name: v.owner_name,
      owner_ssn: v.owner_ssn,
      owner_address: v.owner_address,
      vehicle_reg_no: v.reg_no,
      vehicle_vin: v.vin,
      vehicle_model: v.model,
      vehicle_year: v.year,
      vehicle_mileage: v.mileage == null ? null : String(v.mileage),
      vehicle_weight: v.weight == null ? null : String(v.weight),
      vehicle_total_weight: v.total_weight == null ? null : String(v.total_weight),
      current_date: v.app_date,
    };

    let pdf: Buffer;
    let missing: string[];
    try {
      ({ pdf, missing } = await ocr.fillPdf(fillValues));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'fill-pdf failed', id: v.id, error: String(e) }));
      return err(res, 502, 'OCR_FILL_FAILED', 'PDF 생성 서비스를 사용할 수 없습니다.');
    }

    try {
      await vehicles.addDocument({
        vehicle_id: v.id,
        kind: 'malso_application',
        file_bytes: pdf,
        orig_name: null,
        mime: 'application/pdf',
        size_bytes: pdf.length,
      });
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'pdf store failed', id: v.id, error: String(e) }));
      return err(res, 500, 'STORAGE_FULL', 'PDF 저장에 실패했습니다.');
    }
    await vehicles.setCompleted(v.id);

    const label = (v.reg_no || v.vin || 'vehicle').replace(/\s+/g, '');
    const filename = `말소등록신청서_${label}_${todayCompact()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Missing-Fields', missing.join(','));
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});
