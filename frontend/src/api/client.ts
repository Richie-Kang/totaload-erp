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

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', body: form });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
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
