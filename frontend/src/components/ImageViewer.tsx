import { useRef, useState } from 'react';

export interface ViewerItem {
  url: string;
  mime: string;
  name?: string;
}

// Image (or single-page PDF via <iframe>) viewer with wheel/button zoom, drag pan, 90° rotate,
// thumbnail switching and "원본 다운로드". Rotation is display-only — the source file is untouched.
// docs/UI_GUIDE.md §4.3, §4.5, §2.8 (이미지 뷰어).
export function ImageViewer({ items }: { items: ViewerItem[] }) {
  const [idx, setIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-neutral-800 text-sm text-neutral-600">
        첨부된 등록증 이미지가 없습니다.
      </div>
    );
  }

  const cur = items[Math.min(idx, items.length - 1)];
  const isPdf = cur.mime === 'application/pdf';

  function reset() {
    setScale(1);
    setRot(0);
    setPos({ x: 0, y: 0 });
  }
  function pick(i: number) {
    setIdx(i);
    reset();
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        {!isPdf && (
          <>
            <button onClick={() => setScale((s) => Math.min(s * 1.25, 8))} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">확대 +</button>
            <button onClick={() => setScale((s) => Math.max(s / 1.25, 0.2))} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">축소 −</button>
            <button onClick={() => setRot((r) => (r + 90) % 360)} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">90° 회전</button>
            <button onClick={reset} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">원래대로</button>
          </>
        )}
        <a
          href={cur.url}
          download={isPdf ? undefined : (cur.name ?? true)}
          target={isPdf ? '_blank' : undefined}
          rel="noreferrer"
          className="ml-auto underline hover:no-underline"
        >
          {isPdf ? '원본 PDF 보기' : '원본 다운로드'}
        </a>
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
        onWheel={
          isPdf
            ? undefined
            : (e) => {
                e.preventDefault();
                setScale((s) => Math.min(Math.max(s * (e.deltaY < 0 ? 1.1 : 0.9), 0.2), 8));
              }
        }
        onMouseDown={isPdf ? undefined : (e) => (drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y })}
        onMouseMove={
          isPdf
            ? undefined
            : (e) => {
                if (drag.current) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
              }
        }
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        style={{ minHeight: 320, cursor: isPdf ? 'default' : 'grab' }}
      >
        {isPdf ? (
          // #view=Fit makes the embedded PDF viewer fit the page to the iframe (whole page visible).
          <iframe title={cur.name ?? 'PDF'} src={`${cur.url}#view=Fit`} className="h-full w-full" style={{ minHeight: 480 }} />
        ) : (
          // max-h/w-full + object-contain means scale=1 = fits container. The transform's scale then
          // magnifies on top of the fitted size, so zoom in / out behaves intuitively.
          <img
            src={cur.url}
            alt={cur.name ?? '등록증'}
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px) scale(${scale}) rotate(${rot}deg)`,
            }}
          />
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded border ${i === idx ? 'border-neutral-400' : 'border-neutral-800'}`}
            >
              {it.mime === 'application/pdf' ? (
                <span className="flex h-full w-full items-center justify-center bg-neutral-900 text-[10px] text-neutral-500">PDF</span>
              ) : (
                <img src={it.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
