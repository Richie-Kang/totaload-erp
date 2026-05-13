import { NavLink, Outlet } from 'react-router-dom';

// Fixed left sidebar (~220px): product name + the two screens. docs/UI_GUIDE.md §4.2.
export function SidebarLayout() {
  const link = (active: boolean) =>
    `block rounded-md px-3 py-2 text-sm ${active ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-neutral-800 bg-[#0d0d0d] px-3 py-5">
        <div className="px-3 pb-6 text-lg font-semibold tracking-tight">Totaload</div>
        <nav className="space-y-1">
          <NavLink to="/malso/new" className={({ isActive }) => link(isActive)}>
            말소 입력
          </NavLink>
          <NavLink to="/malso/search" className={({ isActive }) => link(isActive)}>
            말소 검색
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
