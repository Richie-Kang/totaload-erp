// Brand-matching SVG marks for the three OCR providers.
// - Upstage: official staircase / arrow mark (Pantone violet)
// - Codex: OpenAI Codex puffy cloud + `>_` glyph (blue→indigo gradient)
// - Gemini: Google Gemini 4-point spark with the Google rainbow

export function UpstageIcon({ className = 'h-4 w-4' }: { className?: string }) {
  // Upstage mark: an asymmetric diamond/star made of italic horizontal bars.
  // Top tip sits to the right, bottom tip to the left, mid rows span the full width.
  // Each bar is a parallelogram with the top edge shifted right relative to the bottom
  // (italic up-right). Light-violet → deep-violet vertical gradient matches the brand.
  const h = 4;   // bar height
  const s = 5;   // italic slant — top shifted right of bottom by this much
  // [y_top, x_left, x_right]
  const bars: [number, number, number][] = [
    [4, 68, 88],   // top-right tip
    [12, 58, 90],
    [20, 44, 92],
    [28, 8, 92],
    [36, 6, 90],   // widest band
    [44, 6, 88],
    [52, 8, 92],
    [60, 10, 50],
    [68, 8, 36],
    [76, 6, 24],
    [84, 4, 16],   // bottom-left tip
  ];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="up-grad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#C0C5FB" />
          <stop offset="55%" stopColor="#8B7DF6" />
          <stop offset="100%" stopColor="#5A2EE0" />
        </linearGradient>
      </defs>
      <g fill="url(#up-grad)">
        {bars.map(([yt, xl, xr], i) => (
          <path
            key={i}
            d={`M ${xl} ${yt + h} L ${xr} ${yt + h} L ${xr + s} ${yt} L ${xl + s} ${yt} Z`}
          />
        ))}
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
