import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title?: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation dialog for hard-to-undo actions. Esc closes (docs/UI_GUIDE.md §4.6).
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Continue · 계속',
  cancelLabel = 'Cancel · 취소',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="fade-in glass w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>}
        <div className="text-base leading-relaxed text-slate-700">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-base text-slate-600 hover:text-slate-900"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="rounded-xl bg-violet-600 px-4 py-2 text-base font-semibold text-white shadow-md shadow-violet-600/30 hover:bg-violet-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
