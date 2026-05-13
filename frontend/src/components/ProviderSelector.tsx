import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OCR_PROVIDER, OCR_PROVIDERS, type OcrProvider } from '../api/types';
import { CodexIcon, GeminiIcon, UpstageIcon } from './ProviderIcons';

const STORAGE_KEY = 'totaload.ocrProvider';

const META: Record<OcrProvider, { name: string; kr: string; tag: string; Icon: (p: { className?: string }) => JSX.Element }> = {
  upstage: { name: 'Upstage', kr: '업스테이지', tag: 'Document OCR · primary', Icon: UpstageIcon },
  codex: { name: 'Codex', kr: '코덱스', tag: 'OpenAI CLI vision', Icon: CodexIcon },
  gemini: { name: 'Gemini', kr: '제미나이', tag: 'Google 1.5 Flash', Icon: GeminiIcon },
};

function readStored(): OcrProvider {
  if (typeof window === 'undefined') return DEFAULT_OCR_PROVIDER;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return (OCR_PROVIDERS as readonly string[]).includes(v ?? '') ? (v as OcrProvider) : DEFAULT_OCR_PROVIDER;
}

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

// Segmented control with provider logos. Upstage first (primary).
export function ProviderSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">
        OCR engine <span className="text-slate-400">· OCR 엔진</span>
      </span>
      <div className="glass-soft inline-flex rounded-xl p-1">
        {OCR_PROVIDERS.map((p) => {
          const meta = META[p];
          const Icon = meta.Icon;
          const active = p === value;
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={
                'flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 ' +
                (active
                  ? 'bg-white text-slate-900 shadow-md ring-1 ring-violet-300/40'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900')
              }
              title={meta.tag}
              aria-pressed={active}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{meta.name}</span>
              <span className="hidden text-xs text-slate-500 md:inline">· {meta.kr}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
