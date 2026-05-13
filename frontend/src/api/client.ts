// Thin fetch wrapper. Normalizes errors to { code, message }. See docs/ARCHITECTURE.md §2.5.

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'HTTP_' + res.status;
  let message = res.statusText || '요청에 실패했습니다.';
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(code, message, res.status);
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

// Transient errors on Render free-tier: containers sleep after 15 min idle, so the
// first request after a long pause can return 502/503/504 while the container wakes.
// We retry POST uploads once after a short delay so the user doesn't have to.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const attempt = async (): Promise<Response> =>
    fetch(path, { method: 'POST', body: form });
  let res: Response;
  try {
    res = await attempt();
  } catch (networkErr) {
    // Pure network failure (DNS, TCP, TLS) — wait a bit and retry once.
    await new Promise((r) => setTimeout(r, 4_000));
    res = await attempt().catch(() => {
      throw networkErr;
    });
  }
  if (!res.ok && TRANSIENT_STATUSES.has(res.status)) {
    // Likely cold-start. Wait for the upstream container to come up, then retry once.
    await new Promise((r) => setTimeout(r, 8_000));
    res = await attempt();
  }
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) throw await parseError(res);
}

// POST that returns a PDF blob plus the X-Missing-Fields header.
export async function apiPostPdf(
  path: string,
  body: unknown,
): Promise<{ blob: Blob; missing: string[] }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const header = res.headers.get('X-Missing-Fields') ?? '';
  const missing = header.split(',').map((s) => s.trim()).filter(Boolean);
  return { blob, missing };
}
