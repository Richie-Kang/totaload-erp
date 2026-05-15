import { NavLink, Outlet } from 'react-router-dom';

// Glass sidebar over the gradient background. Bilingual nav (English · 한글). docs/UI_GUIDE.md §4.2.
export function SidebarLayout() {
  const linkClass = (active: boolean) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors ${
      active
        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
        : 'text-slate-700 hover:bg-white/60 hover:text-slate-900'
    }`;
  return (
    <div className="flex min-h-screen">
      <aside className="glass sticky top-0 flex h-screen w-[240px] shrink-0 flex-col rounded-r-2xl px-4 py-6">
        <div className="px-3 pb-6">
          <div className="text-xl font-semibold tracking-tight text-slate-900">Hanaru AI ERP</div>
          <div className="text-xs text-slate-500">Used-car export ERP</div>
        </div>
        <nav className="space-y-1.5">
          <NavLink to="/malso/new" className={({ isActive }) => linkClass(isActive)}>
            <SvgInput />
            <span className="flex-1">
              <span className="font-medium">Deregistration Input</span>
              <span className="block text-xs opacity-80">말소 입력</span>
            </span>
          </NavLink>
          <NavLink to="/malso/search" className={({ isActive }) => linkClass(isActive)}>
            <SvgSearch />
            <span className="flex-1">
              <span className="font-medium">Search</span>
              <span className="block text-xs opacity-80">말소 검색</span>
            </span>
          </NavLink>
        </nav>
        <div className="mt-auto px-3 pt-6 text-xs leading-relaxed text-slate-500">
          <p className="font-medium text-slate-600">TRYNIC Co., Ltd.</p>
          <p>Used-car export deregistration assistant</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SvgInput() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  );
}
function SvgSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
