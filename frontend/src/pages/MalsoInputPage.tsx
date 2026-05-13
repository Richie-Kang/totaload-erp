import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGeneratePdf, useSearch, useUploadMalso, useVehicle } from '../api/hooks';
import type { OcrFields, OcrProvider, OcrStatus } from '../api/types';
import { ApiError } from '../api/client';
import { Dropzone } from '../components/Dropzone';
import { ImageViewer, type ViewerItem } from '../components/ImageViewer';
import { VehicleForm, type ApplyOcr } from '../components/VehicleForm';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState, Skeleton, StatusBadge } from '../components/misc';
import { ProviderSelector, useOcrProvider } from '../components/ProviderSelector';
import { LiveClock } from '../components/LiveClock';
import { useToast } from '../components/Toast';
import { formatDateTime, todayKr } from '../lib/format';
import type { FormValues } from '../lib/merge';

type OcrResult = {
  status: OcrStatus;
  warnings: string[];
  errorCode: string | null;
  fields: OcrFields;
  provider?: OcrProvider;
};

export function MalsoInputPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // ---- form session key: stable across our own new→:id transition, fresh otherwise ----
  const [formKey, setFormKey] = useState<string>(() => routeId ?? 'new');
  const justUploadedId = useRef<string | null>(null);
  const prevRouteId = useRef<string | undefined>(routeId);

  // ---- local upload state (state B) ----
  const [localFile, setLocalFile] = useState<{ file: File; url: string } | null>(null);
  const [analyzeCancelled, setAnalyzeCancelled] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [applyOcr, setApplyOcr] = useState<ApplyOcr | null>(null);
  const applyToken = useRef(0);
  const [unsaved, setUnsaved] = useState(false);

  const upload = useUploadMalso();
  const vehicleQuery = useVehicle(routeId);
  const generatePdf = useGeneratePdf(routeId ?? '');
  const [provider, setProvider] = useOcrProvider();

  useEffect(() => {
    if (prevRouteId.current === routeId) return;
    const ours = !!routeId && routeId === justUploadedId.current;
    prevRouteId.current = routeId;
    if (!ours) {
      setFormKey(routeId ?? `new-${Date.now()}`);
      // navigated to a different vehicle / back to /malso/new → drop the local upload session
      setLocalFile((lf) => {
        if (lf) URL.revokeObjectURL(lf.url);
        return null;
      });
      setOcrResult(null);
      setApplyOcr(null);
      setAnalyzeCancelled(false);
      upload.reset();
    }
  }, [routeId]); // intentionally keyed on routeId only

  // ---- warn before leaving the tab while a save is failing ----
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  // ---- handle an uploaded file ----
  function startUpload(file: File) {
    setAnalyzeCancelled(false);
    setOcrResult(null);
    setApplyOcr(null);
    const url = URL.createObjectURL(file);
    setLocalFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url };
    });
    upload.mutate(
      { file, provider },
      {
        onSuccess: (res) => {
          justUploadedId.current = res.vehicle.id;
          if (!analyzeCancelledRef.current) {
            setOcrResult({
              status: res.ocrStatus,
              warnings: res.warnings,
              errorCode: res.errorCode,
              fields: res.fields,
              provider: res.ocrProvider,
            });
            applyToken.current += 1;
            setApplyOcr({ fields: res.fields, mode: 'fill-empty', token: applyToken.current });
          }
          if (res.vehicle.id !== routeId) navigate(`/malso/${res.vehicle.id}`, { replace: true });
        },
        onError: (e) => {
          toast.error(
            e instanceof ApiError
              ? `Upload failed: ${e.message} · 업로드 실패`
              : 'Upload failed · 업로드 실패',
            { label: 'Retry · 재시도', onClick: () => startUpload(file) },
          );
        },
      },
    );
  }
  // keep latest cancelled flag readable inside the async callback
  const analyzeCancelledRef = useRef(analyzeCancelled);
  analyzeCancelledRef.current = analyzeCancelled;

  // ---- re-upload (다시 분석 / 이미지 추가 첨부) via a hidden file input ----
  const reuploadInput = useRef<HTMLInputElement>(null);
  const reuploadMode = useRef<'fill-empty' | 'overwrite' | 'attach'>('fill-empty');
  function pickReupload(mode: 'fill-empty' | 'overwrite' | 'attach') {
    reuploadMode.current = mode;
    reuploadInput.current?.click();
  }
  function onReuploadFile(file: File) {
    upload.mutate(
      { file, provider },
      {
        onSuccess: (res) => {
          if (res.vehicle.id !== routeId) {
            justUploadedId.current = res.vehicle.id;
            navigate(`/malso/${res.vehicle.id}`, { replace: true });
          }
          vehicleQuery.refetch();
          if (reuploadMode.current !== 'attach') {
            setOcrResult({
              status: res.ocrStatus,
              warnings: res.warnings,
              errorCode: res.errorCode,
              fields: res.fields,
              provider: res.ocrProvider,
            });
            applyToken.current += 1;
            setApplyOcr({ fields: res.fields, mode: reuploadMode.current as 'fill-empty' | 'overwrite', token: applyToken.current });
          } else {
            toast.success('Attached · 이미지 첨부 완료');
          }
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError
              ? `Upload failed: ${e.message} · 업로드 실패`
              : 'Upload failed · 업로드 실패',
          ),
      },
    );
  }

  // ---- confirm modal (promise-based) for "important field empty" / "overwrite on re-analyze" ----
  const [confirmState, setConfirmState] = useState<{ title: string; body: string; resolve: (v: boolean) => void } | null>(null);
  function ask(title: string, body: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmState({ title, body, resolve }));
  }

  // ---- "다시 분석" handler: ask overwrite vs fill-empty, then pick a file ----
  async function handleReanalyze() {
    const overwrite = await ask(
      '다시 분석',
      '현재 입력값을 OCR 결과로 덮어쓸까요?(수동 수정값 포함) "취소"를 누르면 빈 칸만 채웁니다.',
    );
    pickReupload(overwrite ? 'overwrite' : 'fill-empty');
  }

  // ---- PDF ----
  const [pdfBlob, setPdfBlob] = useState<{ blob: Blob; name: string } | null>(null);
  async function handleGeneratePdf(values: FormValues) {
    if (!routeId) return;
    try {
      const { blob, missing } = await generatePdf.mutateAsync(values);
      const tag = (values.reg_no || values.vin || '차량').replace(/\s+/g, '');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      setPdfBlob({ blob, name: `말소등록신청서_${tag}_${stamp}.pdf` });
      if (missing.length) toast.show(`Empty fields: ${missing.join(', ')} · 비어 있는 항목`, { kind: 'info' });
      else toast.success('PDF generated · PDF 생성 완료');
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? `PDF generation failed: ${e.message} · PDF 생성 실패`
          : 'PDF generation failed · PDF 생성 실패',
      );
    }
  }

  // ---- derived ----
  const docs = vehicleQuery.data?.documents ?? [];
  const regCertDocs = docs.filter((d) => d.kind === 'registration_cert');
  const pdfDocs = docs.filter((d) => d.kind === 'malso_application');
  const viewerItems: ViewerItem[] =
    regCertDocs.length > 0
      ? regCertDocs.map((d) => ({ url: d.url, mime: d.mime, name: d.orig_name ?? undefined }))
      : localFile
        ? [{ url: localFile.url, mime: localFile.file.type || 'image/jpeg', name: localFile.file.name }]
        : [];

  const analyzing = upload.isPending && !analyzeCancelled && !!localFile;
  const showForm = !!localFile || (!!routeId && !!vehicleQuery.data);
  const vehicle = vehicleQuery.data?.vehicle ?? null;

  // ---- state A: no vehicle yet, no upload in flight ----
  if (!routeId && !localFile) {
    return <StateA onFile={startUpload} provider={provider} setProvider={setProvider} />;
  }

  // ---- state C reached via search: vehicle still loading ----
  if (routeId && !localFile && vehicleQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-[60vh]" />
        </div>
      </div>
    );
  }
  if (routeId && !localFile && vehicleQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 py-10 text-center">
        <p className="text-lg text-slate-700">Vehicle not found · 이 차량을 찾을 수 없습니다</p>
        <button onClick={() => navigate('/malso/search')} className="text-base text-violet-700 underline">
          ← Back to search · 검색으로
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex justify-end">
        <LiveClock />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {vehicle ? (
          <>
            <button
              onClick={() => navigate('/malso/search')}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              ← Back to search · 검색으로
            </button>
            <h1 className="text-2xl font-semibold text-slate-900">{vehicle.reg_no || '— (no plate)'}</h1>
            <span className="text-base text-slate-500">{vehicle.model || 'No model · 차명 미입력'}</span>
            <StatusBadge status={vehicle.status} />
            <span className="hidden text-xs text-slate-500 sm:inline">
              Created {formatDateTime(vehicle.created_at)} · Updated {formatDateTime(vehicle.updated_at)}
            </span>
          </>
        ) : (
          <h1 className="text-2xl font-semibold text-slate-900">
            Deregistration Input <span className="text-base font-normal text-slate-500">· 말소 입력</span>
          </h1>
        )}
        <div className="ml-auto">
          <ProviderSelector value={provider} onChange={setProvider} disabled={upload.isPending} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-h-[480px]">
          <ImageViewer items={viewerItems} />
        </div>
        <div className="glass flex min-h-[480px] flex-col rounded-2xl p-5">
          {showForm ? (
            <VehicleForm
              key={formKey}
              vehicleId={routeId}
              initialVehicle={vehicle}
              analyzing={analyzing}
              onCancelAnalyze={() => setAnalyzeCancelled(true)}
              ocrResult={analyzeCancelled ? null : ocrResult}
              onReanalyze={routeId ? handleReanalyze : undefined}
              onAttachMore={routeId ? () => pickReupload('attach') : undefined}
              applyOcr={applyOcr}
              onMissingImportant={(labels) =>
                ask(
                  'Required fields are empty · 필수 항목 비어있음',
                  `${labels.join(', ')} — proceed anyway? · 그대로 만들까요?`,
                )
              }
              onGeneratePdf={handleGeneratePdf}
              onUnsavedChange={setUnsaved}
            />
          ) : (
            <Skeleton className="h-full" />
          )}
        </div>
      </div>

      {pdfDocs.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-700">
            Generated applications <span className="font-normal normal-case tracking-normal text-slate-400">· 생성된 말소등록 신청서</span>
          </h3>
          <ul className="space-y-1.5 text-sm">
            {pdfDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-4 text-slate-700">
                <span className="text-slate-500">{formatDateTime(d.created_at)}</span>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-violet-700 underline hover:no-underline">
                  Preview · 미리보기
                </a>
                <a href={d.url} download className="text-violet-700 underline hover:no-underline">
                  Download · 다운로드
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        ref={reuploadInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onReuploadFile(f);
          e.target.value = '';
        }}
      />

      <PdfPreviewModal
        blob={pdfBlob?.blob ?? null}
        filename={pdfBlob?.name ?? 'malso.pdf'}
        onClose={() => setPdfBlob(null)}
        onNew={() => {
          setPdfBlob(null);
          navigate('/malso/new');
        }}
      />
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        body={confirmState?.body ?? ''}
        confirmLabel="계속"
        cancelLabel="취소"
        onConfirm={() => {
          confirmState?.resolve(true);
          setConfirmState(null);
        }}
        onCancel={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
      />
    </div>
  );
}

// ---- state A ----
function StateA({
  onFile,
  provider,
  setProvider,
}: {
  onFile: (f: File) => void;
  provider: OcrProvider;
  setProvider: (p: OcrProvider) => void;
}) {
  const navigate = useNavigate();
  const search = useSearch('');
  const drafts = (search.data ?? []).filter((v) => v.status === 'draft').slice(0, 10);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 py-4">
      <div className="flex justify-end">
        <LiveClock />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Deregistration Input
            <span className="ml-3 text-xl font-normal text-slate-500">· 말소 입력</span>
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Drop a registration certificate — the form opens immediately, and empty fields
            auto-fill when OCR returns.
            <br />
            <span className="text-slate-500">자동차등록증을 올리면 빈 폼이 즉시 열리고, 분석이 끝나면 빈 칸이 자동으로 채워집니다.</span>
          </p>
        </div>
        <ProviderSelector value={provider} onChange={setProvider} />
      </div>
      <Dropzone onFile={onFile} />
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-700">
          In progress <span className="font-normal normal-case tracking-normal text-slate-400">· 작성 중</span>
        </h2>
        {search.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState>
            <p>No drafts yet — drop a certificate above to start.</p>
            <p className="mt-1 text-sm text-slate-400">작성 중인 차량이 없습니다. 등록증을 올려 시작하세요.</p>
          </EmptyState>
        ) : (
          <ul className="glass-soft divide-y divide-white/40 overflow-hidden rounded-2xl">
            {drafts.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => navigate(`/malso/${v.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-base hover:bg-white/60"
                >
                  <span className="font-medium text-slate-900">{v.reg_no || '— (no plate)'}</span>
                  <span className="text-slate-600">{v.model || ''}</span>
                  <span className="text-slate-500">{v.owner_name || ''}</span>
                  <span className="ml-auto"><StatusBadge status={v.status} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-slate-400">{todayKr()}</p>
    </div>
  );
}
