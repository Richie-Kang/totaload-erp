import { useRef, useState } from 'react';

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

interface Props {
  onFile: (file: File) => void;
  compact?: boolean;
}

// Drag & drop + click-to-select, with a client-side first-pass type/size check.
// docs/UI_GUIDE.md §4.3 상태 A.
export function Dropzone({ onFile, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateAndEmit(file: File) {
    if (!ALLOWED_EXT.test(file.name) && !ACCEPT.split(',').includes(file.type)) {
      if (/\.hei[cf]$/i.test(file.name))
        setError('HEIC 는 지원하지 않습니다. JPG/PNG/PDF 로 변환해 주세요.');
      else setError('지원하지 않는 형식입니다. JPG·PNG·PDF 파일을 올려 주세요.');
      return;
    }
    if (file.size === 0) {
      setError('빈 파일입니다.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('파일이 너무 큽니다. 20MB 이하로 올려 주세요.');
      return;
    }
    setError(null);
    onFile(file);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) validateAndEmit(f);
        }}
        className={`glass-soft block w-full rounded-2xl border-2 border-dashed text-center transition-all ${
          compact ? 'px-4 py-8' : 'px-6 py-20'
        } ${over ? 'border-violet-500 bg-violet-50/80 ring-4 ring-violet-200/40' : 'border-violet-300/70 hover:border-violet-400'}`}
      >
        <svg viewBox="0 0 24 24" className="mx-auto mb-3 h-10 w-10 text-violet-500" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
        <p className="text-lg font-medium text-slate-800">
          Drop the registration certificate, or click to choose
        </p>
        <p className="mt-1 text-base text-slate-500">자동차등록증을 끌어다 놓거나 클릭해서 선택</p>
        <p className="mt-3 text-sm text-slate-400">JPG · PNG · PDF · up to 20 MB · 20MB 이하</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPT},image/*`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) validateAndEmit(f);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
    </div>
  );
}
