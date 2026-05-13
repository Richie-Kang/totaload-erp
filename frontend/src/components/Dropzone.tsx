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
        className={`block w-full rounded-lg border-2 border-dashed text-center transition-colors ${
          compact ? 'px-4 py-6' : 'px-6 py-16'
        } ${over ? 'border-neutral-500 bg-neutral-900' : 'border-neutral-700 hover:border-neutral-600'}`}
      >
        <p className="text-sm text-neutral-300">
          자동차등록증 이미지를 끌어다 놓거나 클릭해서 선택
        </p>
        <p className="mt-1 text-xs text-neutral-500">JPG · PNG · PDF · 20MB 이하</p>
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
      {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
    </div>
  );
}
