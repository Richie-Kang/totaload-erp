import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDeleteVehicle, useSearch } from '../api/hooks';
import { ApiError } from '../api/client';
import { useDebounce } from '../lib/useDebounce';
import { Skeleton, StatusBadge } from '../components/misc';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { formatDate, splitHighlight } from '../lib/format';
import type { VehicleSummary } from '../api/types';

// 말소 검색 — search-as-you-type. Centered glass list. docs/UI_GUIDE.md §4.4.
export function MalsoSearchPage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const debounced = useDebounce(q.trim(), 300);
  const { data, isLoading, isFetching, isError } = useSearch(debounced);
  const del = useDeleteVehicle();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<VehicleSummary | null>(null);
  const rows = data ?? [];

  function highlight(text: string | null) {
    const t = text ?? '';
    if (!debounced) return t || '—';
    const [a, m, z] = splitHighlight(t, debounced);
    return m ? (
      <>
        {a}
        <mark className="rounded bg-amber-200 px-0.5 text-inherit">{m}</mark>
        {z}
      </>
    ) : (
      t || '—'
    );
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await del.mutateAsync(target.id);
      toast.show(
        `Deleted ${target.reg_no || target.vin || 'vehicle'} · 삭제 완료`,
        { kind: 'success' },
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Delete failed · 삭제 실패';
      toast.show(msg, { kind: 'error' });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Search <span className="text-xl font-normal text-slate-500">· 말소 검색</span>
        </h1>
        <p className="mt-2 text-base text-slate-500">
          Find a past vehicle by plate or VIN · 차량번호 또는 차대번호로 검색
        </p>
      </div>

      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Plate or VIN · 차량번호 또는 차대번호 일부"
          className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Clear · 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {!debounced && (
        <p className="text-center text-sm text-slate-500">Recent vehicles · 최근 차량</p>
      )}
      {rows.length > 50 && (
        <p className="text-center text-sm text-amber-700">
          Too many results — narrow your query · 결과가 많습니다, 더 정확히 입력하세요
        </p>
      )}

      {isError ? (
        <p className="text-center text-base text-amber-700">
          Search error — try again · 검색 중 오류가 발생했습니다
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        debounced ? (
          <div className="glass-soft rounded-2xl border border-dashed border-violet-200 px-6 py-12 text-center text-base text-slate-500">
            <p>No vehicle matches "{debounced}" · 일치하는 차량 없음</p>
            <Link to="/malso/new" className="mt-3 inline-block text-violet-700 underline">
              Start a new input · 말소 입력에서 새로 추가
            </Link>
          </div>
        ) : (
          <div className="glass-soft rounded-2xl border border-dashed border-violet-200 px-6 py-12 text-center text-base text-slate-500">
            <p>No vehicles yet · 아직 차량이 없습니다</p>
            <Link to="/malso/new" className="mt-3 inline-block text-violet-700 underline">
              Go to input · 말소 입력으로
            </Link>
          </div>
        )
      ) : (
        <ul className={`glass divide-y divide-white/40 overflow-hidden rounded-2xl ${isFetching ? 'opacity-70' : ''}`}>
          {rows.map((v) => (
            <li key={v.id} className="group flex items-center gap-2 pr-3 hover:bg-white/50">
              <button
                onClick={() => navigate(`/malso/${v.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/malso/${v.id}`)}
                className="flex flex-1 items-center gap-4 px-5 py-4 text-left text-base"
              >
                <span className="w-32 shrink-0 font-semibold text-slate-900">{highlight(v.reg_no)}</span>
                <span className="flex-1 truncate text-slate-700">
                  {v.model || <span className="text-slate-400">no model · 차명 미입력</span>}
                </span>
                <span className="w-28 shrink-0 truncate text-slate-500">{v.owner_name || ''}</span>
                <span className="shrink-0">
                  <StatusBadge status={v.status} />
                </span>
                <span className="w-24 shrink-0 text-right text-sm text-slate-500">{formatDate(v.created_at)}</span>
              </button>
              <button
                onClick={() => setPendingDelete(v)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${v.reg_no || v.vin || ''}`}
                title="Delete · 삭제"
              >
                Delete · 삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete vehicle · 차량 삭제"
        body={
          <>
            <p>
              All data and attachments for{' '}
              <span className="font-medium text-slate-900">{pendingDelete?.reg_no || pendingDelete?.vin || 'this vehicle'}</span>
              {' '}will be permanently removed.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{pendingDelete?.reg_no || pendingDelete?.vin || '이 차량'}</span>
              의 모든 정보와 첨부 문서가 영구 삭제됩니다.
            </p>
            <p className="mt-3 text-sm text-amber-700">This action cannot be undone · 되돌릴 수 없습니다.</p>
          </>
        }
        confirmLabel="Delete · 삭제"
        cancelLabel="Cancel · 취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
