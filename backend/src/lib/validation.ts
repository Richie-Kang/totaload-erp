// Totaload ERP — request validation helpers for the malso routes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Columns the client may set via PATCH /api/malso/:id or POST /api/malso/:id/pdf { fields }.
export const ALLOWED_VEHICLE_FIELDS = [
  'reg_no',
  'vin',
  'owner_name',
  'owner_ssn',
  'owner_address',
  'model',
  'year',
  'mileage',
  'weight',
  'app_date',
  'note',
] as const;

const NUMERIC_FIELDS = new Set(['mileage', 'weight']);
const MAX_TEXT_LEN = 2000;
const MAX_NUMERIC = 100_000_000;

// Returns an error message if the fields object is invalid, otherwise null. Unknown keys are ignored
// (vehicles.update only applies allowed columns).
export function validateVehicleFields(fields: Record<string, unknown>): string | null {
  for (const key of ALLOWED_VEHICLE_FIELDS) {
    if (!(key in fields)) continue;
    const v = fields[key];
    if (v == null) continue;
    if (NUMERIC_FIELDS.has(key)) {
      if (typeof v === 'string' && v.trim() === '') continue;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0 || n > MAX_NUMERIC) return `${key} 값이 올바르지 않습니다.`;
    } else {
      if (typeof v !== 'string' && typeof v !== 'number') return `${key} 값이 올바르지 않습니다.`;
      if (String(v).length > MAX_TEXT_LEN) return `${key} 값이 너무 깁니다.`;
    }
  }
  return null;
}
