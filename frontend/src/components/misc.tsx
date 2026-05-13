import type { ReactNode } from 'react';
import type { VehicleStatus } from '../api/types';

// Small shared presentational bits: EmptyState, Skeleton, StatusBadge.

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-800 ${className}`} />;
}

export function StatusBadge({ status }: { status: VehicleStatus }) {
  const completed = status === 'completed';
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
        completed ? 'bg-green-950 text-green-400' : 'bg-neutral-800 text-neutral-400'
      }`}
    >
      {completed ? '완료' : '작성중'}
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
