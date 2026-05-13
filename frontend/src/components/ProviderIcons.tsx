// Inline SVG marks for the three OCR providers. Simple, recognizable, no remote logos.

export function UpstageIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#5B21B6" />
      <path
        d="M8 7v6a4 4 0 0 0 8 0V7"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function CodexIcon({ className = 'h-4 w-4' }: { className?: string }) {
  // OpenAI's six-fold rosette, simplified — center hexagon + 6 axes.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="10.5" fill="#0D0D0D" />
      <g stroke="white" strokeWidth="1.4" strokeLinecap="round">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M7 7l10 10" />
        <path d="M7 17L17 7" />
      </g>
      <circle cx="12" cy="12" r="2.2" fill="#0D0D0D" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

export function GeminiIcon({ className = 'h-4 w-4' }: { className?: string }) {
  // Gemini's 4-pointed spark with a Google-ish gradient.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gem-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="55%" stopColor="#9333EA" />
          <stop offset="100%" stopColor="#EA4335" />
        </linearGradient>
      </defs>
      <path
        d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z"
        fill="url(#gem-grad)"
      />
    </svg>
  );
}
