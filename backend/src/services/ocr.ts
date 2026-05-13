// Totaload ERP — client for the Python OCR/PDF service. The frontend never calls ocr-service directly;
// everything goes through here (docs/ARCHITECTURE.md §2.1, §2.3, §2.5).

const OCR_SERVICE_URL = (process.env.OCR_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');

// The 9 logical OCR fields (matches ocr-service ExtractedFields).
export interface OcrFields {
  owner_name: string | null;
  owner_ssn: string | null;
  owner_address: string | null;
  vehicle_reg_no: string | null;
  vehicle_vin: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  vehicle_mileage: number | null;
  vehicle_weight: number | null;
}

export type OcrStatus = 'ok' | 'partial' | 'failed';

export interface ExtractResult {
  fields: OcrFields;
  raw: unknown;
  status: OcrStatus;
  warnings: string[];
  errorCode: string | null;
}

export function emptyFields(): OcrFields {
  return {
    owner_name: null,
    owner_ssn: null,
    owner_address: null,
    vehicle_reg_no: null,
    vehicle_vin: null,
    vehicle_model: null,
    vehicle_year: null,
    vehicle_mileage: null,
    vehicle_weight: null,
  };
}

export function failedResult(message = 'ocr-service 응답 없음', errorCode = 'OCR_UNAVAILABLE'): ExtractResult {
  return { fields: emptyFields(), raw: null, status: 'failed', warnings: [message], errorCode };
}

// Sends the uploaded image to ocr-service /extract. Never throws — network/timeout/5xx degrade to a
// failed result so the upload flow still completes (ADR-009, §2.2).
export async function extract(buf: Buffer, filename: string): Promise<ExtractResult> {
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buf)]), filename || 'upload');
    const res = await fetch(`${OCR_SERVICE_URL}/extract`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(95_000),
    });
    if (!res.ok) return failedResult();
    const data = (await res.json()) as {
      fields?: Partial<OcrFields>;
      raw?: unknown;
      status?: OcrStatus;
      warnings?: string[];
      error_code?: string | null;
    };
    return {
      fields: { ...emptyFields(), ...(data.fields ?? {}) },
      raw: data.raw ?? null,
      status: data.status ?? 'failed',
      warnings: data.warnings ?? [],
      errorCode: data.error_code ?? null,
    };
  } catch {
    return failedResult();
  }
}

export interface FillPdfValues {
  owner_name: string | null;
  owner_ssn: string | null;
  owner_address: string | null;
  vehicle_reg_no: string | null;
  vehicle_vin: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  vehicle_mileage: string | null;
  vehicle_weight: string | null;
  current_date: string | null;
}

// Calls ocr-service /fill-pdf. Throws on failure (the route maps that to 502).
export async function fillPdf(values: FillPdfValues): Promise<{ pdf: Buffer; missing: string[] }> {
  const res = await fetch(`${OCR_SERVICE_URL}/fill-pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ocr-service /fill-pdf failed: ${res.status}`);
  const missing = (res.headers.get('x-missing-fields') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pdf = Buffer.from(await res.arrayBuffer());
  return { pdf, missing };
}

export async function health(): Promise<'ok' | 'down'> {
  try {
    const res = await fetch(`${OCR_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}
