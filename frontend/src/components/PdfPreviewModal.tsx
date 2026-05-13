import { useEffect, useState } from 'react';

interface Props {
  blob: Blob | null;
  filename: string;
  onClose: () => void; // "닫고 계속 수정"
  onNew: () => void; // "새 말소 입력 시작"
}

// Preview a generated 말소등록 신청서 PDF before download/print. Falls back to a download link
// if the browser can't render the embedded PDF. docs/UI_GUIDE.md §4.3 (액션바), §2.8 (PDF 미리보기 폴백).
export function PdfPreviewModal({ blob, filename, onClose, onNew }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [canEmbed, setCanEmbed] = useState(true);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useEffect(() => {
    if (!blob) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blob, onClose]);

  if (!blob || !url) return null;

  function print() {
    const w = window.open(url!, '_blank');
    if (w) {
      w.addEventListener('load', () => w.print());
    } else {
      setCanEmbed(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="fade-in glass flex h-[88vh] w-full max-w-4xl flex-col rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/40 px-5 py-3.5">
          <h2 className="text-lg font-semibold text-slate-900">
            Application preview <span className="text-sm font-normal text-slate-500">· 말소등록 신청서 미리보기</span>
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 overflow-hidden bg-white/60">
          {canEmbed ? (
            <object data={url} type="application/pdf" className="h-full w-full" onError={() => setCanEmbed(false)}>
              <div className="flex h-full items-center justify-center p-6 text-center text-base text-slate-600">
                Your browser can't preview PDFs inline · 이 브라우저에서는 PDF 미리보기 불가{' '}
                <a href={url} download={filename} className="ml-2 text-violet-700 underline">Download · PDF 다운로드</a>
              </div>
            </object>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-base text-slate-600">
              Your browser can't preview PDFs inline · 이 브라우저에서는 PDF 미리보기 불가{' '}
              <a href={url} download={filename} className="ml-2 text-violet-700 underline">Download · PDF 다운로드</a>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/40 px-5 py-4">
          <a
            href={url}
            download={filename}
            className="rounded-xl bg-violet-600 px-4 py-2 text-base font-semibold text-white shadow-md shadow-violet-600/30 hover:bg-violet-700"
          >
            Download · 다운로드
          </a>
          <button
            onClick={print}
            className="rounded-xl border border-violet-200 bg-white/70 px-4 py-2 text-base text-slate-800 hover:bg-white"
          >
            Print · 인쇄
          </button>
          <span className="text-sm text-slate-500">Print at 100% scale · 실제 크기로 인쇄하세요</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-xl px-3 py-2 text-base text-slate-600 hover:text-slate-900">
              Close · 닫고 계속 수정
            </button>
            <button
              onClick={onNew}
              className="rounded-xl border border-violet-200 bg-white/70 px-3 py-2 text-base text-slate-800 hover:bg-white"
            >
              New input · 새 말소 입력
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
