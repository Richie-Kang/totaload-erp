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
            e instanceof ApiError ? `업로드 실패: ${e.message}` : '업로드에 실패했습니다.',
            { label: '재시도', onClick: () => startUpload(file) },
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
            toast.success('이미지를 첨부했습니다.');
          }
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : '업로드에 실패했습니다.'),
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
      if (missing.length) toast.show(`비어 있는 항목: ${missing.join(', ')}`, { kind: 'info' });
      else toast.success('PDF 를 만들었습니다.');
    } catch (e) {
      toast.error(e instanceof ApiError ? `PDF 생성 실패: ${e.message}` : 'PDF 생성에 실패했습니다.');
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
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">이 차량을 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/malso/search')} className="text-sm underline">← 검색으로</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {vehicle ? (
          <>
            <button onClick={() => navigate('/malso/search')} className="text-sm text-neutral-400 hover:text-neutral-200">← 검색으로</button>
            <h1 className="text-xl font-semibold">{vehicle.reg_no || '(차량번호 미입력)'}</h1>
            <span className="text-sm text-neutral-400">{vehicle.model || '차명 미입력'}</span>
            <StatusBadge status={vehicle.status} />
            <span className="hidden text-xs text-neutral-500 sm:inline">
              생성 {formatDateTime(vehicle.created_at)} · 수정 {formatDateTime(vehicle.updated_at)}
            </span>
          </>
        ) : (
          <h1 className="text-xl font-semibold">말소 입력</h1>
        )}
        <div className="ml-auto">
          <ProviderSelector value={provider} onChange={setProvider} disabled={upload.isPending} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-h-[420px]">
          <ImageViewer items={viewerItems} />
        </div>
        <div className="flex min-h-[420px] flex-col">
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
                ask('필수 항목이 비어 있습니다', `${labels.join(', ')} 가(이) 비어 있습니다. 그대로 만들까요?`)
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
        <div className="rounded-lg border border-neutral-800 bg-[#141414] p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">생성된 말소등록 신청서</h3>
          <ul className="space-y-1 text-sm">
            {pdfDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-neutral-300">
                <span className="text-neutral-500">{formatDateTime(d.created_at)}</span>
                <a href={d.url} target="_blank" rel="noreferrer" className="underline hover:no-underline">미리보기</a>
                <a href={d.url} download className="underline hover:no-underline">다운로드</a>
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
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="mb-1 text-2xl font-semibold">말소 입력</h1>
          <p className="text-sm text-neutral-400">자동차등록증을 올리면 빈 폼이 즉시 열리고, 분석이 끝나면 빈 칸이 자동으로 채워집니다.</p>
        </div>
        <ProviderSelector value={provider} onChange={setProvider} />
      </div>
      <Dropzone onFile={onFile} />
      <div>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">작성 중</h2>
        {search.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState>작성 중인 차량이 없습니다. 등록증을 올려 시작하세요.</EmptyState>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {drafts.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => navigate(`/malso/${v.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-neutral-900"
                >
                  <span className="font-medium text-neutral-200">{v.reg_no || '(차량번호 미입력)'}</span>
                  <span className="text-neutral-400">{v.model || '차명 미입력'}</span>
                  <span className="text-neutral-500">{v.owner_name || ''}</span>
                  <span className="ml-auto"><StatusBadge status={v.status} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-neutral-600">{todayKr()}</p>
    </div>
  );
}
