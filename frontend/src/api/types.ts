// Backend API contract (see phases/0-mvp step3 / docs/ARCHITECTURE.md §2.5). Frontend matches this exactly.

export type OcrStatus = 'ok' | 'partial' | 'failed';
export type VehicleStatus = 'draft' | 'completed';
export type OcrProvider = 'upstage' | 'codex' | 'gemini';
export const OCR_PROVIDERS: readonly OcrProvider[] = ['upstage', 'codex', 'gemini'];
export const DEFAULT_OCR_PROVIDER: OcrProvider = 'upstage';

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
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

export interface VehicleSummary {
  id: string;
  reg_no: string | null;
  vin: string | null;
  model: string | null;
  owner_name: string | null;
  status: VehicleStatus;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  kind: string; // 'registration_cert' | 'malso_application'
  orig_name: string | null;
  mime: string;
  created_at: string;
  url: string; // '/api/files/<id>'
}

// OCR field names as returned by POST /api/malso (different from Vehicle column names).
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

export interface UploadResponse {
  vehicle: Vehicle;
  fields: OcrFields;
  ocrStatus: OcrStatus;
  ocrProvider?: OcrProvider;
  warnings: string[];
  errorCode: string | null;
}

export interface VehicleDetail {
  vehicle: Vehicle;
  documents: DocumentItem[];
}

// Editable vehicle fields (PATCH /api/malso/:id { fields }).
export type VehicleField =
  | 'reg_no'
  | 'vin'
  | 'owner_name'
  | 'owner_ssn'
  | 'owner_address'
  | 'model'
  | 'year'
  | 'mileage'
  | 'weight'
  | 'app_date'
  | 'note';

export type VehicleFieldValues = Partial<Record<VehicleField, string | number | null>>;

// Map OCR field name -> Vehicle field name.
export const OCR_TO_VEHICLE: Record<keyof OcrFields, VehicleField> = {
  owner_name: 'owner_name',
  owner_ssn: 'owner_ssn',
  owner_address: 'owner_address',
  vehicle_reg_no: 'reg_no',
  vehicle_vin: 'vin',
  vehicle_model: 'model',
  vehicle_year: 'year',
  vehicle_mileage: 'mileage',
  vehicle_weight: 'weight',
};
