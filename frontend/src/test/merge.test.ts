import { describe, expect, it } from 'vitest';
import { mergeOcrFields, missingOcrLabels } from '../lib/merge';
import type { OcrFields, VehicleField } from '../api/types';

function ocr(partial: Partial<OcrFields>): OcrFields {
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
    vehicle_total_weight: null,
    ...partial,
  };
}

describe('mergeOcrFields — 만진 필드 보호', () => {
  it('fills only empty, untouched fields', () => {
    const out = mergeOcrFields(
      { owner_name: '', mileage: '' },
      ocr({ owner_name: '홍길동', vehicle_mileage: 12000, vehicle_vin: 'KMHxxxx' }),
      { touched: new Set<VehicleField>() },
    );
    expect(out.owner_name).toBe('홍길동');
    expect(out.mileage).toBe('12000');
    expect(out.vin).toBe('KMHxxxx');
  });

  it('never overwrites a field the user touched', () => {
    const out = mergeOcrFields(
      { mileage: '99999', owner_name: '' },
      ocr({ vehicle_mileage: 12000, owner_name: '홍길동' }),
      { touched: new Set<VehicleField>(['mileage']) },
    );
    expect(out.mileage).toBe('99999'); // preserved
    expect(out.owner_name).toBe('홍길동'); // untouched + empty -> filled
  });

  it('never overwrites a non-empty untouched field either', () => {
    const out = mergeOcrFields(
      { owner_name: '기존값' },
      ocr({ owner_name: 'OCR값' }),
      { touched: new Set<VehicleField>() },
    );
    expect(out.owner_name).toBe('기존값');
  });

  it('ignores OCR fields that are empty/null', () => {
    const out = mergeOcrFields({ owner_name: '' }, ocr({ owner_name: '   ' }), { touched: new Set<VehicleField>() });
    expect(out.owner_name).toBe('');
  });

  it('overwrite mode replaces touched and non-empty fields', () => {
    const out = mergeOcrFields(
      { mileage: '99999', owner_name: '기존' },
      ocr({ vehicle_mileage: 12000, owner_name: 'OCR' }),
      { touched: new Set<VehicleField>(['mileage']), overwrite: true },
    );
    expect(out.mileage).toBe('12000');
    expect(out.owner_name).toBe('OCR');
  });
});

describe('missingOcrLabels', () => {
  it('lists the fields OCR did not fill', () => {
    const labels = missingOcrLabels(ocr({ owner_name: '홍길동', vehicle_vin: 'X' }));
    expect(labels).not.toContain('소유자명');
    expect(labels).not.toContain('차대번호');
    expect(labels).toContain('주행거리');
  });
});
