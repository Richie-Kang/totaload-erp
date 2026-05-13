import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OCR_PROVIDER, OCR_PROVIDERS, type OcrProvider } from '../api/types';

const STORAGE_KEY = 'totaload.ocrProvider';

const META: Record<OcrProvider, { name: string; tag: string }> = {
  upstage: { name: 'Upstage', tag: 'Document OCR · primary' },
  codex: { name: 'Codex', tag: 'CLI vision' },
  gemini: { name: 'Gemini', tag: '1.5 Flash' },
};

function readStored(): OcrProvider {
  if (typeof window === 'undefined') return DEFAULT_OCR_PROVIDER;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return (OCR_PROVIDERS as readonly string[]).includes(v ?? '') ? (v as OcrProvider) : DEFAULT_OCR_PROVIDER;
}

// React hook: returns [provider, setProvider]. Persists in localStorage.
export function useOcrProvider(): [OcrProvider, (p: OcrProvider) => void] {
  const [provider, setProviderState] = useState<OcrProvider>(readStored);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, provider);
  }, [provider]);
  const set = useCallback((p: OcrProvider) => setProviderState(p), []);
  return [provider, set];
}

interface Props {
  value: OcrProvider;
  onChange: (p: OcrProvider) => void;
  disabled?: boolean;
}

// Segmented control — Upstage first (primary). Compact, fits a page header.
export function ProviderSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-neutral-500">OCR 엔진</span>
      <div className="inline-flex rounded-md border border-neutral-800 bg-neutral-900 p-0.5">
        {OCR_PROVIDERS.map((p) => {
          const active = p === value;
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={
                'rounded px-2.5 py-1 transition-colors disabled:opacity-50 ' +
                (active
                  ? 'bg-white text-black'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100')
              }
              title={META[p].tag}
              aria-pressed={active}
            >
              {META[p].name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
