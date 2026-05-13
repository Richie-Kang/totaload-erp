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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="fade-in flex h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-neutral-700 bg-[#161616]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-base font-semibold">말소등록 신청서 미리보기</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300" aria-label="닫기">✕</button>
        </div>

        <div className="flex-1 overflow-hidden bg-neutral-900">
          {canEmbed ? (
            <object data={url} type="application/pdf" className="h-full w-full" onError={() => setCanEmbed(false)}>
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">
                이 브라우저에서는 PDF 미리보기를 열 수 없습니다.{' '}
                <a href={url} download={filename} className="underline">PDF 다운로드</a>
              </div>
            </object>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">
              이 브라우저에서는 PDF 미리보기를 열 수 없습니다.{' '}
              <a href={url} download={filename} className="underline">PDF 다운로드</a>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <a
            href={url}
            download={filename}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            다운로드
          </a>
          <button onClick={print} className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800">
            인쇄
          </button>
          <span className="text-xs text-neutral-500">실제 크기(100%)로 인쇄하세요.</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200">
              닫고 계속 수정
            </button>
            <button onClick={onNew} className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800">
              새 말소 입력 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
