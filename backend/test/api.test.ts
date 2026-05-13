import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock only the network-facing ocr-service client; keep helpers (emptyFields/failedResult) real.
vi.mock('../src/services/ocr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/ocr')>();
  return { ...actual, extract: vi.fn(), fillPdf: vi.fn(), health: vi.fn() };
});

import { app } from '../src/app';
import { pool } from '../src/db/pool';
import * as ocr from '../src/services/ocr';

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_JPG = path.resolve(here, '../../assets/samples/20251203_자동차등록증.jpg');

const hasDb = Boolean(process.env.DATABASE_URL);

const mockedExtract = vi.mocked(ocr.extract);
const mockedFillPdf = vi.mocked(ocr.fillPdf);
const mockedHealth = vi.mocked(ocr.health);

function token() {
  return Math.random().toString(36).slice(2, 10);
}

function ocrResult(over: Partial<ocr.ExtractResult> = {}): ocr.ExtractResult {
  return {
    fields: ocr.emptyFields(),
    raw: '{}',
    status: 'partial',
    warnings: [],
    errorCode: null,
    provider: 'upstage',
    ...over,
  };
}

// Uploads the sample jpg with a stubbed OCR result; returns the created vehicle.
async function upload(result: ocr.ExtractResult, provider?: string) {
  mockedExtract.mockResolvedValueOnce(result);
  const req = request(app).post('/api/malso').attach('file', SAMPLE_JPG);
  if (provider) req.field('provider', provider);
  const res = await req;
  expect(res.status).toBe(201);
  return res;
}

describe.skipIf(!hasDb)('backend API', () => {
  beforeEach(() => {
    mockedExtract.mockReset();
    mockedFillPdf.mockReset();
    mockedHealth.mockReset();
    mockedExtract.mockResolvedValue(ocr.failedResult());
    mockedHealth.mockResolvedValue('down');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/health includes db and ocr status', async () => {
    mockedHealth.mockResolvedValue('ok');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(['ok', 'down']).toContain(res.body.db);
    expect(['ok', 'down']).toContain(res.body.ocr);
  });

  it('POST /api/malso stores the image, runs OCR, creates vehicle + registration_cert document', async () => {
    const t = token();
    const res = await upload(
      ocrResult({ fields: { ...ocr.emptyFields(), owner_name: '홍길동', vehicle_reg_no: `RG${t}`, vehicle_vin: `VN${t}` }, status: 'partial' }),
    );
    expect(res.body.ocrStatus).toBe('partial');
    expect(res.body.fields.owner_name).toBe('홍길동');
    const id: string = res.body.vehicle.id;
    expect(id).toBeTruthy();

    const detail = await request(app).get(`/api/malso/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.documents).toHaveLength(1);
    expect(detail.body.documents[0].kind).toBe('registration_cert');
    expect(detail.body.documents[0].url).toBe(`/api/files/${detail.body.documents[0].id}`);
    expect(detail.body.documents[0].mime).toBe('image/jpeg');
  });

  it('rejects a disallowed mimetype with 400', async () => {
    const res = await request(app)
      .post('/api/malso')
      .attach('file', Buffer.from('plain text content'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_TYPE');
  });

  it('rejects content that does not match a real image (magic bytes) with 400', async () => {
    const res = await request(app)
      .post('/api/malso')
      .attach('file', Buffer.from('not really a jpeg'), { filename: 'fake.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_CONTENT');
  });

  it('rejects an oversized upload with 400 or 413', async () => {
    const big = Buffer.alloc(25 * 1024 * 1024, 0xff);
    const res = await request(app).post('/api/malso').attach('file', big, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect([400, 413]).toContain(res.status);
  });

  it('still returns 201 with ocrStatus=failed when ocr.extract throws', async () => {
    mockedExtract.mockReset();
    mockedExtract.mockRejectedValueOnce(new Error('ocr timeout'));
    const res = await request(app).post('/api/malso').attach('file', SAMPLE_JPG);
    expect(res.status).toBe(201);
    expect(res.body.ocrStatus).toBe('failed');
  });

  it('forwards the provider field to ocr.extract and echoes ocrProvider', async () => {
    const t = token();
    mockedExtract.mockResolvedValueOnce(
      ocrResult({ fields: { ...ocr.emptyFields(), vehicle_vin: `VN${t}` }, provider: 'gemini' }),
    );
    const res = await request(app)
      .post('/api/malso')
      .field('provider', 'gemini')
      .attach('file', SAMPLE_JPG);
    expect(res.status).toBe(201);
    expect(res.body.ocrProvider).toBe('gemini');
    // ocr.extract should have been called with provider='gemini' as 3rd arg
    expect(mockedExtract).toHaveBeenCalledWith(expect.any(Buffer), expect.any(String), 'gemini');
  });

  it('defaults provider to upstage when no field is supplied', async () => {
    const t = token();
    mockedExtract.mockResolvedValueOnce(
      ocrResult({ fields: { ...ocr.emptyFields(), vehicle_vin: `VN${t}` }, provider: 'upstage' }),
    );
    const res = await request(app).post('/api/malso').attach('file', SAMPLE_JPG);
    expect(res.status).toBe(201);
    expect(res.body.ocrProvider).toBe('upstage');
    expect(mockedExtract).toHaveBeenCalledWith(expect.any(Buffer), expect.any(String), 'upstage');
  });

  it('rejects an unknown provider with 400 BAD_PROVIDER', async () => {
    const res = await request(app)
      .post('/api/malso')
      .field('provider', 'claude')
      .attach('file', SAMPLE_JPG);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_PROVIDER');
  });

  it('PATCH /api/malso/:id updates allowed fields', async () => {
    const t = token();
    const created = await upload(ocrResult({ fields: { ...ocr.emptyFields(), vehicle_vin: `VN${t}` } }));
    const id: string = created.body.vehicle.id;

    const res = await request(app).patch(`/api/malso/${id}`).send({ fields: { mileage: '12,345', note: '메모', model: '레이' } });
    expect(res.status).toBe(200);
    expect(res.body.vehicle.mileage).toBe(12345);
    expect(res.body.vehicle.note).toBe('메모');
    expect(res.body.vehicle.model).toBe('레이');

    const bad = await request(app).patch(`/api/malso/${id}`).send({ fields: { mileage: 'abc' } });
    expect(bad.status).toBe(400);

    const missing = await request(app).patch('/api/malso/00000000-0000-4000-8000-000000000000').send({ fields: { note: 'x' } });
    expect(missing.status).toBe(404);
  });

  it('POST /api/malso/:id/pdf generates a PDF, attaches it, marks the vehicle completed', async () => {
    const t = token();
    const created = await upload(ocrResult({ fields: { ...ocr.emptyFields(), vehicle_reg_no: `RG${t}`, vehicle_vin: `VN${t}` } }));
    const id: string = created.body.vehicle.id;

    const fakePdf = Buffer.from('%PDF-1.4 fake content');
    mockedFillPdf.mockResolvedValueOnce({ pdf: fakePdf, missing: ['owner_address'] });

    const res = await request(app).post(`/api/malso/${id}/pdf`).send({ fields: { mileage: '5000' } });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-missing-fields']).toBe('owner_address');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");

    const detail = await request(app).get(`/api/malso/${id}`);
    expect(detail.body.vehicle.status).toBe('completed');
    expect(detail.body.vehicle.mileage).toBe(5000);
    const pdfDoc = detail.body.documents.find((d: { kind: string }) => d.kind === 'malso_application');
    expect(pdfDoc).toBeTruthy();
  });

  it('returns 502 when ocr.fillPdf fails', async () => {
    const created = await upload(ocrResult({ fields: { ...ocr.emptyFields(), vehicle_vin: `VN${token()}` } }));
    const id: string = created.body.vehicle.id;
    mockedFillPdf.mockRejectedValueOnce(new Error('ocr down'));
    const res = await request(app).post(`/api/malso/${id}/pdf`).send({});
    expect(res.status).toBe(502);
  });

  it('GET /api/files/:docId streams the stored file; bad uuid -> 400, unknown -> 404', async () => {
    const created = await upload(ocrResult({ fields: { ...ocr.emptyFields(), vehicle_vin: `VN${token()}` } }));
    const id: string = created.body.vehicle.id;
    const detail = await request(app).get(`/api/malso/${id}`);
    const docId: string = detail.body.documents[0].id;

    const fileRes = await request(app).get(`/api/files/${docId}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toBe('image/jpeg');

    expect((await request(app).get('/api/files/not-a-uuid')).status).toBe(400);
    expect((await request(app).get('/api/files/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('GET /api/malso/search matches reg_no / vin parts, treats wildcards literally, never returns owner_ssn', async () => {
    const t = token();
    const created = await upload(
      ocrResult({
        fields: { ...ocr.emptyFields(), owner_name: '김수출', owner_ssn: '860101-1234567', vehicle_reg_no: `RG${t}`, vehicle_vin: `VN${t.toUpperCase()}` },
      }),
    );
    const id: string = created.body.vehicle.id;

    const byReg = await request(app).get(`/api/malso/search`).query({ q: `rg${t}` });
    expect(byReg.status).toBe(200);
    expect(byReg.body.some((r: { id: string }) => r.id === id)).toBe(true);
    expect(byReg.body.every((r: object) => !('owner_ssn' in r))).toBe(true);

    const byVin = await request(app).get(`/api/malso/search`).query({ q: t.toUpperCase() });
    expect(byVin.body.some((r: { id: string }) => r.id === id)).toBe(true);

    const wildcard = await request(app).get(`/api/malso/search`).query({ q: '%_%' });
    expect(wildcard.status).toBe(200);
    expect(Array.isArray(wildcard.body)).toBe(true);
    expect(wildcard.body.some((r: { id: string }) => r.id === id)).toBe(false);

    const recent = await request(app).get('/api/malso/search');
    expect(recent.status).toBe(200);
    expect(recent.body.length).toBeGreaterThan(0);
    expect(recent.body.every((r: object) => !('owner_ssn' in r))).toBe(true);

    const tooLong = await request(app).get('/api/malso/search').query({ q: 'x'.repeat(65) });
    expect(tooLong.status).toBe(400);
  });
});
