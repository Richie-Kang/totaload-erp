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
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-white/40 text-base text-slate-500 backdrop-blur-md">
        No registration certificate attached · 첨부된 등록증 이미지가 없습니다
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

  const btn = 'rounded-lg border border-violet-200/70 bg-white/70 px-2.5 py-1 text-slate-700 backdrop-blur-md hover:bg-white hover:text-slate-900';
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {!isPdf && (
          <>
            <button onClick={() => setScale((s) => Math.min(s * 1.25, 8))} className={btn}>Zoom in · 확대 +</button>
            <button onClick={() => setScale((s) => Math.max(s / 1.25, 0.2))} className={btn}>Zoom out · 축소 −</button>
            <button onClick={() => setRot((r) => (r + 90) % 360)} className={btn}>Rotate 90° · 회전</button>
            <button onClick={reset} className={btn}>Reset · 원래대로</button>
          </>
        )}
        <a
          href={cur.url}
          download={isPdf ? undefined : (cur.name ?? true)}
          target={isPdf ? '_blank' : undefined}
          rel="noreferrer"
          className="ml-auto text-violet-700 underline hover:no-underline"
        >
          {isPdf ? 'Open PDF · 원본 PDF 보기' : 'Download · 원본 다운로드'}
        </a>
      </div>

      <div
        className="glass relative flex-1 overflow-hidden rounded-2xl"
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
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${i === idx ? 'border-violet-500 ring-2 ring-violet-200' : 'border-white/60'}`}
            >
              {it.mime === 'application/pdf' ? (
                <span className="flex h-full w-full items-center justify-center bg-violet-100 text-xs font-medium text-violet-700">PDF</span>
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
