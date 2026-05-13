// Pure merge logic for "만진 필드 보호" — OCR results never overwrite fields the user touched.
// See docs/UI_GUIDE.md §4.1 원칙 3, §4.3 상태 B.

import { OCR_TO_VEHICLE, type OcrFields, type VehicleField } from '../api/types';

export type FormValues = Partial<Record<VehicleField, string>>;

function isEmpty(v: string | undefined): boolean {
  return v == null || v.trim() === '';
}

/**
 * Returns a new FormValues where each OCR field is applied to its mapped vehicle field,
 * but only when (a) the user has not touched that field and (b) it is currently empty —
 * unless `overwrite` is true, in which case touched/non-empty fields are also replaced
 * (the explicit "현재 입력값을 OCR 결과로 덮어쓸까요?" path). Untouched empty fields are
 * always candidates; touched fields are kept verbatim unless `overwrite`.
 */
export function mergeOcrFields(
  current: FormValues,
  ocr: OcrFields,
  opts: { touched: Set<VehicleField>; overwrite?: boolean },
): FormValues {
  const next: FormValues = { ...current };
  for (const [ocrKey, vehKey] of Object.entries(OCR_TO_VEHICLE) as [keyof OcrFields, VehicleField][]) {
    const raw = ocr[ocrKey];
    if (raw == null || String(raw).trim() === '') continue; // OCR gave nothing — leave field as is
    const ocrVal = String(raw).trim();
    if (opts.overwrite) {
      next[vehKey] = ocrVal;
      continue;
    }
    if (opts.touched.has(vehKey)) continue; // user owns this field
    if (!isEmpty(next[vehKey])) continue; // already has a value
    next[vehKey] = ocrVal;
  }
  return next;
}

// Human-readable list of fields OCR did NOT fill (for the partial banner).
const FIELD_LABELS: Partial<Record<VehicleField, string>> = {
  owner_name: '소유자명',
  owner_ssn: '주민(법인)등록번호',
  owner_address: '주소',
  reg_no: '자동차등록번호',
  vin: '차대번호',
  model: '차명',
  year: '형식·연식',
  mileage: '주행거리',
  weight: '차량중량',
};

export function missingOcrLabels(ocr: OcrFields): string[] {
  const out: string[] = [];
  for (const [ocrKey, vehKey] of Object.entries(OCR_TO_VEHICLE) as [keyof OcrFields, VehicleField][]) {
    const raw = ocr[ocrKey];
    if (raw == null || String(raw).trim() === '') out.push(FIELD_LABELS[vehKey] ?? vehKey);
  }
  return out;
}
