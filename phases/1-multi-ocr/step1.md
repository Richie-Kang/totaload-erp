# Step 1: backend-provider-passthrough

## 읽어야 할 파일
- step0 산출물 (`ocr-service/app/providers/`, `extract.py` 의 새 시그니처, `/extract` 의 provider 폼 필드).
- `backend/src/{routes/malso.ts,services/ocr.ts,services/vehicles.ts}` 전부.

## 작업
1. **`backend/src/services/ocr.ts`**:
   - `OcrProvider = 'upstage' | 'codex' | 'gemini'` 타입.
   - `extract(buf, filename, provider?: OcrProvider)` — 기본 `'upstage'`. multipart `provider` 필드 동봉. ocr-service 가 `provider` 메타를 응답하면 `ExtractResult.provider` 로 그대로 전달.
   - `ExtractResult` 에 `provider?: string` 추가.
2. **`backend/src/routes/malso.ts`** `POST /api/malso`:
   - multer 가 multipart 본문 처리할 때 `req.body.provider` 를 허용 화이트리스트(`upstage|codex|gemini`)로 검증; 알 수 없으면 400 `BAD_PROVIDER`; 누락 → `upstage`.
   - `ocr.extract(...)` 에 provider 전달.
   - 응답 body 에 `ocrProvider: provider` 포함.
3. **vehicles.raw_ocr** — 이미 raw 안에 ocr-service 응답 전체가 담기므로 추가 컬럼 불필요. `createFromOcr` 의 rawOcr 객체에 `provider: extract.provider` 한 줄만 추가.

## Acceptance Criteria
```bash
docker compose up -d postgres   # 또는 로컬 postgres
export DATABASE_URL=postgresql://...
npm -w backend test    # 통과. supertest 에 provider=upstage 모킹 + provider=gemini 모킹 케이스 1개씩 추가
npm run build && npm run lint
```

## 검증 절차
1. 위 AC.
2. ocr 모킹: provider 가 응답에 그대로 echo 되는지; 잘못된 provider 면 400.
3. `phases/1-multi-ocr/index.json` step 1 → "completed".

## 금지사항
- ORM 도입 금지. CORS·인증 규칙 변경 금지.
- 기존 응답 shape 호환 깨기 금지 — 신규 필드는 *추가* 만.
