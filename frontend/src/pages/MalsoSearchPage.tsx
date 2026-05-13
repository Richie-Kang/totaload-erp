import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSearch } from '../api/hooks';
import { useDebounce } from '../lib/useDebounce';
import { Skeleton, StatusBadge } from '../components/misc';
import { formatDate, splitHighlight } from '../lib/format';

// 말소 검색 — search-as-you-type (debounce 300ms, from 1 char). Empty query => recent vehicles.
// docs/UI_GUIDE.md §4.4. Never shows owner_ssn (API doesn't return it).
export function MalsoSearchPage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const debounced = useDebounce(q.trim(), 300);
  const { data, isLoading, isFetching, isError } = useSearch(debounced);
  const rows = data ?? [];

  function highlight(text: string | null) {
    const t = text ?? '';
    if (!debounced) return t || '—';
    const [a, m, z] = splitHighlight(t, debounced);
    return m ? (
      <>
        {a}
        <mark className="bg-amber-500/30 text-inherit">{m}</mark>
        {z}
      </>
    ) : (
      t || '—'
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">말소 검색</h1>

      <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="차량번호 또는 차대번호 일부 입력"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-neutral-500 hover:text-neutral-300" aria-label="지우기">
            ✕
          </button>
        )}
      </div>

      {!debounced && <p className="text-xs text-neutral-500">최근 차량</p>}
      {rows.length > 50 && <p className="text-xs text-amber-400">결과가 많습니다. 더 정확히 입력하면 범위를 좁힐 수 있습니다.</p>}

      {isError ? (
        <p className="text-sm text-amber-400">검색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : rows.length === 0 ? (
        debounced ? (
          <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center text-sm text-neutral-500">
            ‘{debounced}’에 해당하는 차량이 없습니다.{' '}
            <Link to="/malso/new" className="underline">말소 입력에서 새로 추가</Link>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center text-sm text-neutral-500">
            아직 차량이 없습니다. <Link to="/malso/new" className="underline">말소 입력</Link> 에서 시작하세요.
          </div>
        )
      ) : (
        <ul className={`divide-y divide-neutral-800 rounded-lg border border-neutral-800 ${isFetching ? 'opacity-60' : ''}`}>
          {rows.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => navigate(`/malso/${v.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/malso/${v.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-neutral-900"
              >
                <span className="w-32 shrink-0 font-medium text-neutral-100">{highlight(v.reg_no)}</span>
                <span className="flex-1 truncate text-neutral-300">{v.model || '차명 미입력'}</span>
                <span className="w-28 shrink-0 truncate text-neutral-400">{v.owner_name || ''}</span>
                <span className="shrink-0"><StatusBadge status={v.status} /></span>
                <span className="w-24 shrink-0 text-right text-neutral-500">{formatDate(v.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
