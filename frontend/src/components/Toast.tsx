import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; action?: Toast['action']; ms?: number }) => void;
  success: (message: string) => void;
  error: (message: string, action?: Toast['action']) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, opts) => {
      const id = nextId.current++;
      const toast: Toast = { id, kind: opts?.kind ?? 'info', message, action: opts?.action };
      setToasts((t) => [...t, toast]);
      const ms = opts?.ms ?? (toast.kind === 'error' ? 6000 : 3000);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const api: ToastApi = {
    show,
    success: (m) => show(m, { kind: 'success' }),
    error: (m, action) => show(m, { kind: 'error', action }),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error'
                ? 'border-red-900 bg-[#1a0f0f] text-red-200'
                : t.kind === 'success'
                  ? 'border-green-900 bg-[#0f1a12] text-green-200'
                  : 'border-neutral-700 bg-[#1a1a1a] text-neutral-200'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="flex-1 leading-relaxed">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="text-neutral-500 hover:text-neutral-300"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            {t.action && (
              <button
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
                className="mt-2 text-xs font-medium underline hover:no-underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
