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
  confirmLabel = '계속',
  cancelLabel = '취소',
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="fade-in w-full max-w-sm rounded-lg border border-neutral-700 bg-[#161616] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-2 text-base font-semibold">{title}</h2>}
        <div className="text-sm leading-relaxed text-neutral-300">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
