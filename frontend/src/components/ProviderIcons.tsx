// Brand-matching SVG marks for the three OCR providers.
// - Upstage: official staircase / arrow mark (Pantone violet)
// - Codex: OpenAI Codex puffy cloud + `>_` glyph (blue→indigo gradient)
// - Gemini: Google Gemini 4-point spark with the Google rainbow

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
  // Puffy 7-lobed "cloud" shape (the Codex CLI mark) with a vertical periwinkle→indigo
  // gradient and a white `>_` glyph inside.
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="codex-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B5BBFC" />
          <stop offset="55%" stopColor="#8B7DF7" />
          <stop offset="100%" stopColor="#5B6EF5" />
        </linearGradient>
      </defs>
      {/* 7-petal puffy lump approximated as overlapping circles */}
      <g fill="url(#codex-cloud)">
        <circle cx="32" cy="14" r="11" />
        <circle cx="49" cy="22" r="11" />
        <circle cx="54" cy="38" r="11" />
        <circle cx="44" cy="52" r="11" />
        <circle cx="24" cy="54" r="11" />
        <circle cx="10" cy="44" r="11" />
        <circle cx="10" cy="26" r="11" />
        <circle cx="32" cy="34" r="22" />
      </g>
      {/* >_ glyph */}
      <path
        d="M22 26 L31 34 L22 42"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M34 42 L46 42" stroke="white" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function GeminiIcon({ className = 'h-4 w-4' }: { className?: string }) {
  // Google Gemini's 4-point spark with concave sides + the Google rainbow.
  // Color stops mirror Google's red/yellow/green/blue rotation.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gem-rainbow" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#EA4335" />
          <stop offset="38%" stopColor="#FBBC04" />
          <stop offset="68%" stopColor="#34A853" />
          <stop offset="100%" stopColor="#4285F4" />
        </linearGradient>
      </defs>
      {/* 4-point sparkle: top/right/bottom/left tips with concave sides via cubics */}
      <path
        d="M12 1.5
           C 12 7.5, 12.6 11.4, 22.5 12
           C 12.6 12.6, 12 16.5, 12 22.5
           C 12 16.5, 11.4 12.6, 1.5 12
           C 11.4 11.4, 12 7.5, 12 1.5 Z"
        fill="url(#gem-rainbow)"
      />
    </svg>
  );
}
