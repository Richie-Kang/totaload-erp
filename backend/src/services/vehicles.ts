// Totaload ERP — vehicles + documents data access (pg, no ORM). See docs/ARCHITECTURE.md §2.3, §2.4, §2.8.

import { query } from '../db/pool.js';
import { todayKr } from '../lib/dates.js';
import { ALLOWED_VEHICLE_FIELDS } from '../lib/validation.js';
import type { ExtractResult } from './ocr.js';

export interface Vehicle {
  id: string;
  reg_no: string | null;
  vin: string | null;
  owner_name: string | null;
  owner_ssn: string | null;
  owner_address: string | null;
  model: string | null;
  year: string | null;
  mileage: number | null;
  weight: number | null;
  app_date: string | null;
  note: string | null;
  raw_ocr: unknown;
  ocr_status: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Search/list rows — never includes owner_ssn (PRD §7).
export interface VehicleSummary {
  id: string;
  reg_no: string | null;
  vin: string | null;
  model: string | null;
  owner_name: string | null;
  status: string;
  created_at: string;
}

// DocumentRow never includes file_bytes — those are fetched only on download (getDocumentBytes).
export interface DocumentRow {
  id: string;
  vehicle_id: string;
  kind: string;
  orig_name: string | null;
  mime: string;
  size_bytes: number;
  created_at: string;
}

const DOC_COLS = 'id, vehicle_id, kind, orig_name, mime, size_bytes, created_at';

const NUMERIC_FIELDS = new Set(['mileage', 'weight']);

function toIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const cleaned = String(v).replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : v;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err != null && (err as { code?: string }).code === '23505';
}

// Creates a vehicle row from an OCR extract result. If a non-empty VIN was extracted and a vehicle
// with that VIN already exists, returns the existing row instead of inserting (PRD S5, §2.8).
export async function createFromOcr(extract: ExtractResult): Promise<Vehicle> {
  const f = extract.fields;
  const vin = emptyToNull(f.vehicle_vin);
  if (vin) {
    const existing = await query<Vehicle>('select * from vehicles where vin = $1', [vin]);
    if (existing.rows[0]) return existing.rows[0];
  }
  const rawOcr = {
    raw: extract.raw,
    status: extract.status,
    warnings: extract.warnings,
    errorCode: extract.errorCode,
  };
  const params = [
    emptyToNull(f.vehicle_reg_no),
    vin,
    emptyToNull(f.owner_name),
    emptyToNull(f.owner_ssn),
    emptyToNull(f.owner_address),
    emptyToNull(f.vehicle_model),
    emptyToNull(f.vehicle_year),
    toIntOrNull(f.vehicle_mileage),
    toIntOrNull(f.vehicle_weight),
    todayKr(),
    JSON.stringify(rawOcr),
    extract.status,
  ];
  try {
    const r = await query<Vehicle>(
      `insert into vehicles
         (reg_no, vin, owner_name, owner_ssn, owner_address, model, year, mileage, weight, app_date, raw_ocr, ocr_status, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
       returning *`,
      params,
    );
    return r.rows[0];
  } catch (err) {
    if (isUniqueViolation(err) && vin) {
      const existing = await query<Vehicle>('select * from vehicles where vin = $1', [vin]);
      if (existing.rows[0]) return existing.rows[0];
    }
    throw err;
  }
}

export async function getById(id: string): Promise<{ vehicle: Vehicle; documents: DocumentRow[] } | null> {
  const v = await query<Vehicle>('select * from vehicles where id = $1', [id]);
  if (!v.rows[0]) return null;
  const d = await query<DocumentRow>(
    `select ${DOC_COLS} from documents where vehicle_id = $1 order by created_at asc`,
    [id],
  );
  return { vehicle: v.rows[0], documents: d.rows };
}

// Updates only the allowed columns present in `fields`; numeric fields are coerced to int|null.
// Always bumps updated_at. Returns null if the vehicle does not exist.
export async function update(id: string, fields: Record<string, unknown>): Promise<Vehicle | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const key of ALLOWED_VEHICLE_FIELDS) {
    if (!(key in fields)) continue;
    const value = NUMERIC_FIELDS.has(key)
      ? toIntOrNull(fields[key])
      : emptyToNull(fields[key] == null ? null : String(fields[key]));
    sets.push(`${key} = $${i++}`);
    params.push(value);
  }
  sets.push('updated_at = now()');
  params.push(id);
  const r = await query<Vehicle>(`update vehicles set ${sets.join(', ')} where id = $${i} returning *`, params);
  return r.rows[0] ?? null;
}

export async function setCompleted(id: string): Promise<void> {
  await query("update vehicles set status = 'completed', updated_at = now() where id = $1", [id]);
}

// Deletes a vehicle and its documents (ON DELETE CASCADE). Returns true if a row was removed.
export async function deleteById(id: string): Promise<boolean> {
  const r = await query('delete from vehicles where id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function addDocument(doc: {
  vehicle_id: string;
  kind: string;
  file_bytes: Buffer;
  orig_name: string | null;
  mime: string;
  size_bytes: number;
}): Promise<DocumentRow> {
  const r = await query<DocumentRow>(
    `insert into documents (vehicle_id, kind, file_bytes, orig_name, mime, size_bytes)
     values ($1,$2,$3,$4,$5,$6) returning ${DOC_COLS}`,
    [doc.vehicle_id, doc.kind, doc.file_bytes, doc.orig_name, doc.mime, doc.size_bytes],
  );
  return r.rows[0];
}

// Fetches the raw bytes + mime for the download route. Returns null if no such document.
export async function getDocumentBytes(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const r = await query<{ file_bytes: Buffer; mime: string }>(
    'select file_bytes, mime from documents where id = $1',
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { bytes: row.file_bytes, mime: row.mime };
}

const SUMMARY_COLS = 'id, reg_no, vin, model, owner_name, status, created_at';

// Partial-match search over reg_no / vin (whitespace- and case-insensitive). When `q` is empty,
// returns the most recently updated vehicles. Always parameterized; ILIKE wildcards in `q` are
// escaped so they match literally (PRD §7, §2.8).
export async function search(q: string, limit: number): Promise<VehicleSummary[]> {
  const lim = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
  if (!q || q.trim() === '') {
    const r = await query<VehicleSummary>(
      `select ${SUMMARY_COLS} from vehicles order by updated_at desc limit $1`,
      [lim],
    );
    return r.rows;
  }
  const normalized = q.replace(/\s/g, '').toLowerCase();
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const pattern = `%${escaped}%`;
  const r = await query<VehicleSummary>(
    `select ${SUMMARY_COLS} from vehicles
       where lower(replace(coalesce(reg_no, ''), ' ', '')) like $1 escape '\\'
          or lower(replace(coalesce(vin, ''), ' ', '')) like $1 escape '\\'
     order by updated_at desc limit $2`,
    [pattern, lim],
  );
  return r.rows;
}
