import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SidebarLayout } from './components/SidebarLayout';
import { MalsoInputPage } from './pages/MalsoInputPage';
import { MalsoSearchPage } from './pages/MalsoSearchPage';

// Totaload ERP — routes. See docs/UI_GUIDE.md §4.2.
export function App() {
  // Render free-plan services sleep after ~15 min idle. Hitting /api/health on app
  // mount wakes the backend, which in turn pings ocr-service, so the entire chain
  // is warm by the time the user clicks "upload". Fire-and-forget; no UI feedback.
  // Repeats every 5 min while the tab is open so an idle browser keeps the chain warm.
  const warmedUp = useRef(false);
  useEffect(() => {
    if (warmedUp.current) return;
    warmedUp.current = true;
    const ping = () => {
      fetch('/api/health', { cache: 'no-store' }).catch(() => {
        // Free-tier cold start can take 30–60 s. Retry once after a delay so the
        // 2nd ping lands on an awake container.
        setTimeout(() => fetch('/api/health', { cache: 'no-store' }).catch(() => {}), 35_000);
      });
    };
    ping();
    const id = window.setInterval(ping, 5 * 60_000);
    return () => window.clearInterval(id);
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
