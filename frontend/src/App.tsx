import { Navigate, Route, Routes } from 'react-router-dom';
import { SidebarLayout } from './components/SidebarLayout';
import { MalsoInputPage } from './pages/MalsoInputPage';
import { MalsoSearchPage } from './pages/MalsoSearchPage';

// Totaload ERP — routes. See docs/UI_GUIDE.md §4.2.
export function App() {
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
