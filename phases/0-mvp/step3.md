# Step 3: backend-api

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` — §2.1, **§2.3(데이터 흐름 A·B·C)**, §2.4, **§2.5(API 명세 — 전부)**, §2.7(에러 처리: backend), §2.8(backend·검색·파일서빙·DB 엣지).
- `docs/PRD.md` — §1.4(필드 매핑), §1.7(보안: SSN 미노출·파일 접근·검색 parameterized).
- `docs/ADR.md` — ADR-006, ADR-009.
- `CLAUDE.md` — 1부 원칙.
- step1 산출물: `backend/src/db/pool.ts`(query 헬퍼), `backend/src/db/migrate.ts`, `backend/src/db/schema.sql`, `backend/src/index.ts`(부팅 시 migrate + /api/health).
- step2 산출물 / `phases/0-mvp/index.json` step2 summary: ocr-service 의 `/extract`(`{fields, raw, status, warnings, error_code}`)·`/fill-pdf`(`FillPdfRequest` JSON → `application/pdf` + `X-Missing-Fields`)·`/health` 계약.
- `assets/malso_application_template.pdf` (참고; PDF 채우기는 ocr-service 가 함).

## 작업

Node/Express/TS 백엔드 API. §2.5 의 모든 엔드포인트 + 업로드 검증 + 디스크 스토리지 + ocr-service 클라이언트 + DB 서비스 + 에러 핸들러. 프론트는 ocr-service 를 직접 호출하지 않는다 — 전부 백엔드 경유.

1. **설정**: `STORAGE_DIR`(기본 `<repo>/storage`), 하위 `uploads/`·`generated/` 없으면 생성. CORS: `CORS_ORIGIN` env 만 허용. JSON body 파서. 에러 핸들러 미들웨어: 모든 에러를 `{ error: { code, message } }` + 적절한 status 로, 스택 노출 금지, 구조화 로그.
2. **`backend/src/services/storage.ts`**: `save(buf: Buffer, ext: string): Promise<string>` (uuid 파일명, `uploads/<uuid>.<ext>` 상대경로 반환), `saveGenerated(buf, 'pdf'): Promise<string>` (`generated/<uuid>.pdf`), `openRead(relPath): {stream, absPath}` — **`path.resolve(STORAGE_DIR, relPath)` 가 `STORAGE_DIR` 로 시작하는지 assert**(traversal 차단), 파일 없으면 명확 에러. `mimeOf(relPath)`.
3. **`backend/src/services/ocr.ts`**: `extract(buf, filename): Promise<{fields, raw, status, warnings, errorCode}>` — `POST ${OCR_SERVICE_URL}/extract` multipart, 타임아웃 95s. 네트워크 오류/5xx/타임아웃 → `{status:'failed', fields: emptyFields, warnings:['ocr-service 응답 없음'], errorCode:'OCR_UNAVAILABLE'}` (throw 하지 마라). `fillPdf(values): Promise<{pdf: Buffer, missing: string[]}>` — `POST ${OCR_SERVICE_URL}/fill-pdf` JSON, 응답 바디=PDF, `X-Missing-Fields` 헤더 파싱. 실패 시 throw(라우트가 502/500). `health(): 'ok'|'down'`.
4. **`backend/src/services/vehicles.ts`** (pool.query 사용):
   - `createFromOcr(input): Promise<Vehicle>` — `vin` 이 비어있지 않으면 먼저 `select * from vehicles where vin = $1` → 있으면 그 행 반환(중복 INSERT 안 함). 없으면 INSERT(`status='draft'`, `ocr_status`, `raw_ocr` jsonb, 매핑된 필드, `app_date` = 오늘 `YYYY년 M월 D일`). INSERT 가 23505(vehicles_vin_uniq)면 잡아서 기존 행 SELECT 반환.
   - `getById(id): Promise<{vehicle, documents}|null>`.
   - `update(id, fields): Promise<Vehicle|null>` — 허용 필드만(`reg_no, vin, owner_name, owner_ssn, owner_address, model, year, mileage, weight, total_weight, app_date, note`), 숫자 필드는 숫자/널로 강제, `updated_at = now()` 명시. 없으면 null.
   - `setCompleted(id)`, `addDocument({vehicle_id, kind, file_path, orig_name, mime, size_bytes})`.
   - `search(q: string, limit: number): Promise<VehicleSummary[]>` — `q` 비어있으면 `select id,reg_no,vin,model,owner_name,status,created_at from vehicles order by updated_at desc limit $1` (최근 차량). 비어있지 않으면 `q2 = q.replace(/\s/g,'').toLowerCase()`, ILIKE 패턴 이스케이프(`\`→`\\`, `%`→`\%`, `_`→`\_`), `where lower(replace(coalesce(reg_no,''),' ','')) like $1 escape '\' or lower(replace(coalesce(vin,''),' ','')) like $1 escape '\'` with `$1 = '%'+escaped+'%'`, `order by updated_at desc limit $2`. **q 를 SQL 문자열에 직접 끼워넣지 마라 — parameterized only.** 반환에 `owner_ssn` 절대 포함하지 마라.
5. **라우트** (`backend/src/routes/malso.ts` 등, `/api` 하위):
   - `POST /api/malso` — multer(메모리 또는 임시디스크). 검증: mimetype ∈ {`image/jpeg`,`image/png`,`image/webp`,`application/pdf`}, size ≤ 20MB, **매직바이트 확인**(`file-type` 등). 위반 → 400(`X-…`/구조화). 통과 → `storage.save` → `ocr.extract` → `vehicles.createFromOcr` → `addDocument(kind='registration_cert', orig_name, mime, size)` → **201** `{vehicle, fields, ocrStatus: status, warnings, errorCode}`. **ocr 가 실패해도 201 로 반환**(이미지·레코드는 만들어짐, ocrStatus='failed'). DB 오류만 500.
   - `GET /api/malso/:id` — 404 또는 `{vehicle, documents:[{id,kind,orig_name,mime,created_at,url:'/api/files/'+id}]}`.
   - `PATCH /api/malso/:id` — body `{fields:{...}}`, 검증(숫자 형식, 길이≤합리값) → `vehicles.update` → `{vehicle}` / 404.
   - `POST /api/malso/:id/pdf` — body 옵션 `{fields}` → 있으면 먼저 `vehicles.update`. 그 후 vehicle 행을 ocr-service 의 `FillPdfRequest` 로 매핑(`vehicle_vin = vin`, `vehicle_weight = weight`, `vehicle_total_weight = total_weight`, `current_date = app_date`, 나머지 1:1) → `ocr.fillPdf` → `storage.saveGenerated` → `addDocument(kind='malso_application')` → `vehicles.setCompleted` → 응답 `application/pdf` 스트림, `Content-Disposition: attachment; filename*=UTF-8''말소등록신청서_<reg_no||vin>_<YYYYMMDD>.pdf`, `X-Missing-Fields: <ocr 응답 헤더 그대로>`. 404 / ocr 실패 502 / 디스크 500.
   - `GET /api/malso/search?q=&limit=` — `q` 0~64자(초과 400), `limit` 기본 50 최대 200 → `vehicles.search` → 배열.
   - `GET /api/files/:docId` — `docId` uuid 검증(아니면 400) → document 조회(없으면 404) → `storage.openRead`(파일 없으면 404 + 로그) → 스트림, `Content-Type` = 저장 mime, `Content-Disposition: inline`.
   - `GET /api/health` — `{status:'ok', db: dbPing(), ocr: ocr.health()}` (200 유지, 하위 상태만 표기).
6. **`backend/src/index.ts`**: 라우터 마운트, CORS, 에러 핸들러 등록(외과적으로 step1 코드 위에).

## Acceptance Criteria

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://totaload:totaload@localhost:5432/totaload
export OCR_SERVICE_URL=http://localhost:8000   # 테스트에서는 ocr 클라이언트를 모킹/주입
npm -w backend run build
npm -w backend run migrate
npm -w backend test    # supertest 통합 테스트. ocr.ts 는 모킹(가짜 클라이언트 주입 또는 nock):
#  - 업로드(샘플 jpg, mimetype/매직바이트 OK) → 201, vehicle+document(kind=registration_cert) 생성, ocrStatus 가 모킹값 반영
#  - 잘못된 mimetype / 25MB → 400 (또는 413)
#  - ocr.extract 가 throw/타임아웃 모킹 → 업로드는 여전히 201, ocrStatus='failed'
#  - PATCH /:id { fields } → vehicle 업데이트 반영
#  - POST /:id/pdf (fillPdf 모킹 = 고정 PDF Buffer) → Content-Type application/pdf, X-Missing-Fields 헤더, document(kind=malso_application) 추가, status='completed'
#  - GET /:id → documents 에 url 포함
#  - GET /api/files/:docId → 스트림 200, content-type 일치; 잘못된 uuid → 400; 없는 docId → 404
#  - search: reg_no 일부 / vin 일부로 생성한 차량 조회됨; q 에 '%','_' 넣어도 안 깨지고 리터럴로 매칭; q 빈값 → 최근 차량; search 응답에 owner_ssn 없음
#  - GET /api/health → db/ocr 상태 포함
npm run build && npm run lint
```

## 검증 절차

1. 위 AC 실행. (DB 가 필요 — `DATABASE_URL` 없으면 통합 테스트 skip 하되 그 사실을 명시; 가능하면 compose postgres 띄워서 실제 실행.)
2. 체크리스트: §2.5 의 모든 엔드포인트가 명세대로(요청/응답/상태코드)인가? §2.8 의 backend/검색/파일서빙/DB 엣지 전부 처리했나? OCR 실패가 업로드를 4xx/5xx 로 막지 않는가? 검색이 parameterized + ESCAPE 인가? `owner_ssn` 이 검색/목록 응답에 없는가? 파일 접근이 docId→DB→STORAGE_DIR 경계 검사인가? ORM 안 썼는가? CLAUDE.md 단순함·외과적 변경?
3. `phases/0-mvp/index.json` step 3 업데이트: 성공 → `"completed"`, `"summary"` 에 라우트 목록·각 응답 shape, `services/{storage,ocr,vehicles}.ts` 시그니처, 검색 쿼리 방식, 프론트가 호출할 API 베이스(예 `/api`)를 한 줄 요약(step4 가 이 계약에 의존).

## 금지사항

- `owner_ssn` 을 `GET /api/malso/search` 나 목록류 응답에 넣지 마라. 이유: 로그인 없는 MVP, 민감정보 노출 최소화(§1.7).
- 사용자 입력 경로/파일명으로 파일에 접근하지 마라 — `docId` → DB 의 `file_path` → `STORAGE_DIR` 경계 검사. 이유: 경로 traversal.
- 검색어 `q` 를 SQL 문자열에 직접 보간하지 마라 — parameterized + `ESCAPE`. 이유: SQL injection.
- OCR(`/extract`) 실패로 `POST /api/malso` 를 4xx/5xx 로 끝내지 마라 — 이미지 저장 + 레코드 생성 + 201, ocrStatus 로만 표기. 이유: 업무를 막지 않는다(§2.2).
- ORM/쿼리빌더 도입 금지. 인증/로그인 추가 금지(MVP 제외).
- 기존 테스트/빌드를 깨뜨리지 마라.
