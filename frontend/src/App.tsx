import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SidebarLayout } from './components/SidebarLayout';
import { MalsoInputPage } from './pages/MalsoInputPage';
import { MalsoSearchPage } from './pages/MalsoSearchPage';

// Hanaru AI ERP — routes. See docs/UI_GUIDE.md §4.2.
export function App() {
  // Render free-plan services sleep after ~15 min idle. Hitting /api/health on app
  // mount wakes the backend, which in turn pings ocr-service, so the entire chain
  // is warm by the time the user clicks "upload". Fire-and-forget; no UI feedback.
  // On mount we poll every 6 s until /api/health reports both db and ocr 'ok' so the
  // chain is warm before the user can act; then we settle into a 5-min keep-warm.
  const warmedUp = useRef(false);
  useEffect(() => {
    if (warmedUp.current) return;
    warmedUp.current = true;
    let cancelled = false;
    let keepWarmId: number | undefined;

    const probe = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return false;
        const body = (await res.json().catch(() => null)) as
          | { db?: string; ocr?: string }
          | null;
        return body?.db === 'ok' && body?.ocr === 'ok';
      } catch {
        return false;
      }
    };

    const warmUntilReady = async () => {
      // ~2 min budget (20 × 6s). After that, fall through to keep-warm and let the
      // upload's own retry budget cover any remaining wake time.
      for (let i = 0; i < 20 && !cancelled; i++) {
        if (await probe()) break;
        await new Promise((r) => setTimeout(r, 6_000));
      }
      if (cancelled) return;
      keepWarmId = window.setInterval(() => {
        void probe();
      }, 5 * 60_000);
    };

    void warmUntilReady();
    return () => {
      cancelled = true;
      if (keepWarmId !== undefined) window.clearInterval(keepWarmId);
    };
  }, []);

  return (
    <Routes>
      <Route element={<SidebarLayout />}>
        <Route path="/" element={<Navigate to="/malso/new" replace />} />
        <Route path="/malso/new" element={<MalsoInputPage />} />
        <Route path="/malso/search" element={<MalsoSearchPage />} />
        <Route path="/malso/:id" element={<MalsoInputPage />} />
        <Route path="*" element={<Navigate to="/malso/new" replace />} />
      </Route>
    </Routes>
  );
}
