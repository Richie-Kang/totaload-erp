// Brand-matching SVG marks for the three OCR providers.
// - Upstage: official staircase / arrow mark (Pantone violet)
// - Codex: OpenAI Codex puffy cloud + `>_` glyph (blue→indigo gradient)
// - Gemini: Google Gemini 4-point spark with the Google rainbow

export function UpstageIcon({ className = 'h-4 w-4' }: { className?: string }) {
  // 7-bar staircase that the official Upstage logo trails to the right of "upstage".
  // Bars slope up-right with slanted (italic) ends to match the wordmark style.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill="#7C3AED">
        <path d="M5 23 L13 23 L11.5 25 L3.5 25 Z" />
        <path d="M7 20 L17 20 L15.5 22 L5.5 22 Z" />
        <path d="M9 17 L21 17 L19.5 19 L7.5 19 Z" />
        <path d="M11 14 L23 14 L21.5 16 L9.5 16 Z" />
        <path d="M13 11 L25 11 L23.5 13 L11.5 13 Z" />
        <path d="M15 8 L25 8 L23.5 10 L13.5 10 Z" />
        <path d="M17 5 L25 5 L23.5 7 L15.5 7 Z" />
      </g>
    </svg>
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
