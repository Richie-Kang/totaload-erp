import { useEffect, useState } from 'react';

// Ticking wall clock — re-renders every second.
export function LiveClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <div
      className={
        'font-mono text-sm tabular-nums text-slate-500 ' + className
      }
      aria-label="current time"
    >
      {hh}:{mm}:{ss}
    </div>
  );
}
