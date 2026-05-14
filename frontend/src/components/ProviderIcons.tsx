// Brand marks for the three OCR providers — user-supplied logo files in /public.

export function UpstageIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <img
      src="/upstage-logo.png"
      alt="Upstage"
      className={className}
      style={{ objectFit: 'contain' }}
      aria-hidden="true"
    />
  );
}

export function CodexIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <img
      src="/codex-logo.jpeg"
      alt="Codex"
      className={className}
      style={{ objectFit: 'contain' }}
      aria-hidden="true"
    />
  );
}

export function GeminiIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <img
      src="/gemini-logo.jpeg"
      alt="Gemini"
      className={className}
      style={{ objectFit: 'contain' }}
      aria-hidden="true"
    />
  );
}
