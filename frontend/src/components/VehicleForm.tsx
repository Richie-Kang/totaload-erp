import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OcrFields, OcrProvider, OcrStatus, Vehicle, VehicleField } from '../api/types';
import { usePatchVehicle } from '../api/hooks';
import { ApiError } from '../api/client';
import { mergeOcrFields, missingOcrLabels, type FormValues } from '../lib/merge';
import { formatClock, stripCommas, todayKr } from '../lib/format';
import { useDebouncedCallback } from '../lib/useDebounce';
import { Spinner } from './misc';

// ---- field definitions (Tab order = registration cert reading order) ----
type FieldKind = 'text' | 'number' | 'date';
interface FieldDef {
  key: VehicleField;
  label: string;
  kind: FieldKind;
  important?: boolean; // amber "확인 필요" when empty
  hint?: string;
}
const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: '소유자',
    fields: [
      { key: 'owner_name', label: '성명(명칭)', kind: 'text', important: true },
      { key: 'owner_ssn', label: '주민(법인)등록번호', kind: 'text', hint: '앞 6자리 - 뒤 7자리 숫자' },
      { key: 'owner_address', label: '주소', kind: 'text' },
    ],
  },
  {
    title: '차량',
    fields: [
      { key: 'reg_no', label: '자동차등록번호', kind: 'text', important: true, hint: '예: 123가4567' },
      { key: 'vin', label: '차대번호', kind: 'text', important: true, hint: '영숫자, 보통 17자' },
      { key: 'model', label: '차명', kind: 'text' },
      { key: 'year', label: '형식·연식', kind: 'text' },
      { key: 'mileage', label: '주행거리(km)', kind: 'number' },
      { key: 'weight', label: '차량중량(kg)', kind: 'number' },
    ],
  },
  {
    title: '신청서',
    fields: [{ key: 'app_date', label: '작성일', kind: 'date', hint: '비우면 오늘 날짜로 채워집니다' }],
  },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

function vehicleToValues(v: Vehicle): FormValues {
  const out: FormValues = {};
  for (const f of ALL_FIELDS) {
    const raw = (v as unknown as Record<string, unknown>)[f.key];
    out[f.key] = raw == null ? '' : String(raw);
  }
  if (!out.app_date) out.app_date = todayKr();
  return out;
}

export interface ApplyOcr {
  fields: OcrFields;
  mode: 'fill-empty' | 'overwrite';
  token: number; // changes each time a new apply is requested
}

interface Props {
  vehicleId: string | undefined; // undefined while the upload is still in flight
  initialVehicle: Vehicle | null; // server row (state C) or null (fresh upload, state B)
  analyzing: boolean; // OCR in progress -> blue banner + "분석 취소"
  onCancelAnalyze?: () => void;
  ocrResult: {
    status: OcrStatus;
    warnings: string[];
    errorCode: string | null;
    fields: OcrFields;
    provider?: OcrProvider;
  } | null;
  onReanalyze?: () => void;
  onAttachMore?: () => void;
  applyOcr: ApplyOcr | null;
  onMissingImportant?: (labels: string[]) => boolean | Promise<boolean>; // confirm before PDF; return true to proceed
  onGeneratePdf: (values: FormValues) => Promise<void>;
  onUnsavedChange?: (unsaved: boolean) => void;
}

export function VehicleForm({
  vehicleId,
  initialVehicle,
  analyzing,
  onCancelAnalyze,
  ocrResult,
  onReanalyze,
  onAttachMore,
  applyOcr,
  onMissingImportant,
  onGeneratePdf,
  onUnsavedChange,
}: Props) {
  const [values, setValues] = useState<FormValues>(() =>
    initialVehicle ? vehicleToValues(initialVehicle) : Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.key === 'app_date' ? todayKr() : ''])),
  );
  const touched = useRef<Set<VehicleField>>(new Set());
  const dirty = useRef<Set<VehicleField>>(new Set()); // changed since last save
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [bannerClosed, setBannerClosed] = useState(false);
  const [generating, setGenerating] = useState(false);

  const patch = usePatchVehicle(vehicleId ?? '');
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const inFlight = useRef(false);

  useEffect(() => onUnsavedChange?.(failCount > 0), [failCount, onUnsavedChange]);

  // ---- save (debounced; one in-flight; resends if more changes queued) ----
  const doSave = useCallback(() => {
    if (!vehicleId) return;
    if (inFlight.current) return;
    const keys = [...dirty.current];
    if (keys.length === 0) return;
    const payload: Record<string, string | null> = {};
    for (const k of keys) {
      const v = (values[k] ?? '').trim();
      payload[k] = v === '' ? null : k === 'mileage' || k === 'weight' ? stripCommas(v) : v;
    }
    dirty.current = new Set();
    inFlight.current = true;
    setSaving(true);
    patchRef.current
      .mutateAsync(payload)
      .then(() => {
        setSavedAt(formatClock(new Date()));
        setFailCount(0);
      })
      .catch((e: unknown) => {
        // re-queue what we tried so a retry resends it
        for (const k of keys) dirty.current.add(k);
        setFailCount((c) => c + 1);
        if (e instanceof ApiError && e.code === 'BAD_FIELDS') {
          // validation rejection — surface but keep editing
        }
      })
      .finally(() => {
        inFlight.current = false;
        setSaving(false);
        if (dirty.current.size > 0) doSave();
      });
  }, [vehicleId, values]);

  const debouncedSave = useDebouncedCallback(doSave, 800);

  function setField(key: VehicleField, value: string, markTouched: boolean) {
    setValues((v) => ({ ...v, [key]: value }));
    if (markTouched) touched.current.add(key);
    dirty.current.add(key);
    debouncedSave.call();
  }

  // When the vehicle id first appears (upload finished), persist whatever the user typed meanwhile.
  const idSeen = useRef(false);
  useEffect(() => {
    if (vehicleId && !idSeen.current) {
      idSeen.current = true;
      for (const k of touched.current) dirty.current.add(k);
      if (dirty.current.size > 0) doSave();
    }
  }, [vehicleId, doSave]);

  // Apply an OCR result into the form (fill-empty by default; overwrite on explicit request).
  const lastApplyToken = useRef<number | null>(null);
  useEffect(() => {
    if (!applyOcr) return;
    if (lastApplyToken.current === applyOcr.token) return;
    lastApplyToken.current = applyOcr.token;
    setValues((cur) => {
      const merged = mergeOcrFields(cur, applyOcr.fields, {
        touched: applyOcr.mode === 'overwrite' ? new Set() : touched.current,
        overwrite: applyOcr.mode === 'overwrite',
      });
      // queue saves for fields that actually changed (only matters once vehicleId exists)
      for (const f of ALL_FIELDS) {
        if ((merged[f.key] ?? '') !== (cur[f.key] ?? '')) dirty.current.add(f.key);
      }
      return merged;
    });
    setBannerClosed(false);
    if (vehicleId) debouncedSave.call();
  }, [applyOcr]); // only re-run when a new OCR apply is requested

  // ---- banner ----
  const banner = useMemo(() => {
    if (analyzing)
      return {
        tone: 'blue' as const,
        text: '등록증을 분석하고 있습니다… 결과가 나오면 빈 칸이 자동으로 채워집니다. 그동안 아는 값을 먼저 입력해도 됩니다.',
      };
    if (!ocrResult || bannerClosed) return null;
    const tag = providerLabel(ocrResult.provider);
    if (ocrResult.status === 'ok')
      return {
        tone: 'green' as const,
        text: `자동 입력 완료 — 값을 등록증과 대조해 확인하세요.${tag ? ` (by ${tag})` : ''}`,
        closable: true,
      };
    if (ocrResult.status === 'partial') {
      const miss = missingOcrLabels(ocrResult.fields);
      return {
        tone: 'amber' as const,
        text:
          `일부 항목만 자동 입력했습니다. 빈 칸을 등록증을 보고 채워 주세요.${miss.length ? ` (누락: ${miss.join(', ')})` : ''}` +
          (tag ? ` (by ${tag})` : ''),
      };
    }
    return {
      tone: 'amber' as const,
      text: `자동 입력에 실패했습니다${ocrResult.errorCode ? ` (사유: ${ocrResult.errorCode})` : ''}${tag ? ` · ${tag}` : ''}. 등록증을 보고 직접 입력해 주세요.`,
      retry: true,
    };
  }, [analyzing, ocrResult, bannerClosed]);

  // ---- PDF ----
  async function handleGeneratePdf() {
    if (generating) return;
    const missingImportant = ALL_FIELDS.filter((f) => f.important && (values[f.key] ?? '').trim() === '');
    if (missingImportant.length && onMissingImportant) {
      const ok = await onMissingImportant(missingImportant.map((f) => f.label));
      if (!ok) return;
    }
    setGenerating(true);
    try {
      // flush any pending edits first
      debouncedSave.flush();
      await onGeneratePdf(values);
    } finally {
      setGenerating(false);
    }
  }

  const ssnLooksOk = !values.owner_ssn || /^\d{6}-?\d{7}$/.test(values.owner_ssn.replace(/\s/g, ''));

  return (
    <div className="flex h-full flex-col">
      {banner && (
        <div
          className={`fade-in mb-4 flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
            banner.tone === 'blue'
              ? 'border-blue-900 bg-[#0d1422] text-blue-200'
              : banner.tone === 'green'
                ? 'border-green-900 bg-[#0f1a12] text-green-200'
                : 'border-amber-900 bg-[#1a160d] text-amber-200'
          }`}
        >
          {banner.tone === 'blue' && <Spinner className="mt-0.5 h-4 w-4" />}
          <span className="flex-1 leading-relaxed">{banner.text}</span>
          {analyzing && onCancelAnalyze && (
            <button onClick={onCancelAnalyze} className="shrink-0 underline hover:no-underline">분석 취소</button>
          )}
          {'retry' in banner && banner.retry && onReanalyze && (
            <button onClick={onReanalyze} className="shrink-0 underline hover:no-underline">다시 분석</button>
          )}
          {'closable' in banner && banner.closable && (
            <button onClick={() => setBannerClosed(true)} className="shrink-0 text-current opacity-60 hover:opacity-100" aria-label="닫기">✕</button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{section.title}</h3>
            <div className="space-y-2">
              {section.fields.map((f) => {
                const val = values[f.key] ?? '';
                const isEmpty = val.trim() === '';
                const isTouched = touched.current.has(f.key);
                const filledByOcr =
                  !!ocrResult &&
                  !isEmpty &&
                  (() => {
                    const ocrKey = (Object.keys(ocrResult.fields) as (keyof OcrFields)[]).find(
                      (k) => OCR_KEY_TO_FIELD[k] === f.key,
                    );
                    return ocrKey ? ocrResult.fields[ocrKey] != null && String(ocrResult.fields[ocrKey]).trim() !== '' : false;
                  })();
                const showAmber = f.important && isEmpty;
                return (
                  <div
                    key={f.key}
                    className={`rounded-md border px-3 py-2 ${showAmber ? 'border-l-2 border-l-amber-500 border-neutral-800' : 'border-neutral-800'} bg-neutral-900/40`}
                  >
                    <div className="flex items-center gap-2">
                      <label htmlFor={`f-${f.key}`} className="w-28 shrink-0 text-xs text-neutral-400">{f.label}</label>
                      <input
                        id={`f-${f.key}`}
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const raw = f.kind === 'number' ? stripCommas(e.target.value) : e.target.value;
                          setField(f.key, raw, true);
                        }}
                        onBlur={() => debouncedSave.flush()}
                        inputMode={f.kind === 'number' ? 'numeric' : undefined}
                        className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm text-neutral-100 outline-none focus:bg-neutral-800/60"
                      />
                      {filledByOcr && (
                        <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                          {isTouched ? '수정됨' : '자동 입력'}
                        </span>
                      )}
                      {showAmber && <span className="shrink-0 text-[10px] text-amber-400">확인 필요</span>}
                    </div>
                    {f.hint && (isEmpty || (f.key === 'owner_ssn' && !ssnLooksOk)) && (
                      <p className="ml-28 mt-0.5 pl-2 text-[10px] text-neutral-600">{f.hint}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {(onReanalyze || onAttachMore) && (
          <div className="flex gap-3 text-xs text-neutral-500">
            {onReanalyze && <button onClick={onReanalyze} className="underline hover:text-neutral-300">다시 분석</button>}
            {onAttachMore && <button onClick={onAttachMore} className="underline hover:text-neutral-300">이미지 추가 첨부</button>}
            <span className="text-neutral-600">· OCR 은 첫 번째 이미지 기준입니다. 다른 장은 보기·참고용.</span>
          </div>
        )}
      </div>

      {/* sticky action bar */}
      <div className="sticky bottom-0 -mx-1 mt-2 flex items-center gap-3 border-t border-neutral-800 bg-[#0a0a0a] px-1 pt-3">
        <button
          onClick={handleGeneratePdf}
          disabled={generating || !vehicleId}
          className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {generating && <Spinner />} 말소등록 신청서 PDF 만들기
        </button>
        <span className="text-xs text-neutral-500">
          {failCount > 0
            ? <button onClick={doSave} className="text-amber-400 underline">저장 실패 — 다시 저장</button>
            : saving
              ? '저장 중…'
              : savedAt
                ? `저장됨 ${savedAt}`
                : ''}
        </span>
      </div>
    </div>
  );
}

function providerLabel(p: OcrProvider | undefined): string {
  if (!p) return '';
  return ({ upstage: 'Upstage', codex: 'Codex', gemini: 'Gemini' } as const)[p];
}

// OCR field name -> Vehicle field name (kept local to avoid an extra import cycle).
const OCR_KEY_TO_FIELD: Record<keyof OcrFields, VehicleField> = {
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
