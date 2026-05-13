import type { ReactNode } from 'react';
import type { VehicleStatus } from '../api/types';

// Small shared presentational bits: EmptyState, Skeleton, StatusBadge, Spinner.

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-300/60 bg-white/50 px-6 py-10 text-center text-base text-slate-500 backdrop-blur-md">
      {children}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-violet-200/60 ${className}`} />;
}

export function StatusBadge({ status }: { status: VehicleStatus }) {
  const completed = status === 'completed';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        completed
          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
      }`}
    >
      {completed ? 'Completed · 완료' : 'Draft · 작성중'}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-current`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
