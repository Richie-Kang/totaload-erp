# §2.8 에러·엣지 케이스 카탈로그 — 처리 위치 점검

`docs/ARCHITECTURE.md §2.8` 의 모든 항목을 코드에서 어디서 처리하는지 매핑한다. (step 6 polish-and-verify 에서 작성. 누락 보강: backend `index.ts` — `DATABASE_URL`/`OCR_SERVICE_URL` 미설정 시 변수명 명시 경고 로그.)

## 업로드 / 입력

| 케이스 | 처리 위치 |
|---|---|
| 파일 없음 / 빈 파일(0바이트) → 400 | `backend/src/routes/malso.ts` POST `/` — `!file \|\| file.buffer.length === 0` → 400 `NO_FILE`. ocr-service 쪽도 `app/main.py` `/extract` 가 `NO_FILE`/`EMPTY_FILE` 400. |
| 허용 외 타입(.docx/.heic/.txt/실행파일) → 400 | `routes/malso.ts` — `ALLOWED_UPLOAD_MIME` (`lib/upload.ts`) 미포함 → 400 `BAD_TYPE`. 프론트 1차 검증: `components/Dropzone.tsx` (`accept`, 클라이언트 타입 체크 + HEIC 안내). |
| MIME 위조(확장자만 .jpg, 내용 다름) → 매직바이트 거부 | `lib/upload.ts` `detectUploadMime(buf)` (FFD8FF / PNG sig / RIFF…WEBP / `%PDF-`) → 실패 시 `routes/malso.ts` 400 `BAD_CONTENT`. |
| 20MB 초과 → 413/400 | `routes/malso.ts` multer `limits.fileSize = 20MB` → `app.ts` `errorHandler` 가 `LIMIT_FILE_SIZE` → 413, 그 외 multer 에러 → 400. 프론트: `Dropzone.tsx` ≤20MB 사전 체크. |
| 손상/잘린 이미지 → `OCR_BAD_IMAGE` → 빈 폼 폴백 | `ocr-service/app/extract.py` `extract_from_upload` — 매직바이트/Pillow open 실패 → `status='failed'`, `error_code='OCR_BAD_IMAGE'`. backend `services/ocr.ts` 가 errorCode 전달, `routes/malso.ts` 는 201 로 레코드 생성(이미지 저장됨). |
| PDF 업로드(스캔본) → 첫 페이지만 렌더 후 처리 | `app/extract.py` — `pypdfium2` 로 page 0 만 렌더(scale 2.0). 렌더 실패 → 빈 폼 폴백. ADR-010. |
| 회전/뒤집힘/저해상도/흐림/그림자 → 부분 추출(`partial`) | `app/extract.py` 정규화 후 일부 키만 채워지면 `status='partial'`. 프론트 `components/VehicleForm.tsx` partial 배너 + 누락 라벨. |
| 등록증 아닌 이미지 → 대부분 null → `partial`/`failed`, 막지 않음 | `app/extract.py` (status 판정) + `routes/malso.ts` (항상 레코드 생성). |
| 양식 변형/구버전/가려진 칸 → 부분 추출 | `app/extract.py` (키별 null 허용 + warning). |
| 매우 큰 해상도(8000px) → 다운스케일 | `app/extract.py` — 장변 2000px 로 다운스케일 후 JPEG q90 로 codex 에 전달. 원본은 `storage/uploads/` 에 그대로 보관(`backend/src/services/storage.ts`). |

## OCR / codex

| 케이스 | 처리 위치 |
|---|---|
| `codex` 미설치 → `OCR_UNAVAILABLE`, `/health` down, 폴백 | `ocr-service/app/codex_client.py` — `CodexUnavailable` → `extract.py` `error_code='OCR_UNAVAILABLE'`; `codex_health()` → `'missing'`. backend `services/ocr.ts` `health()` → `'down'`, `app.ts` `/api/health` 에 `ocr:'down'` 표기. extract 실패 시 `routes/malso.ts` 는 여전히 201. |
| 미인증/토큰 만료 → `OCR_AUTH`, 폴백 + README 안내 | `codex_client.py` — auth substring 패턴 → `CodexAuth` → `error_code='OCR_AUTH'`; `codex_health()` → `'unauthenticated'`. README `보안` 절에 `CODEX_AUTH_JSON` 갱신 절차. |
| 사용량/속도 한도 초과 → `OCR_RATE_LIMIT`, "잠시 후 재시도" | `codex_client.py` — rate substring 패턴 → `CodexRateLimit` → `error_code='OCR_RATE_LIMIT'`. 프론트 failed 배너 사유 표시. |
| 타임아웃(>90s) → `OCR_TIMEOUT`, 폴백 | `codex_client.py` `subprocess.run(timeout=90)` → `CodexTimeout` → `error_code='OCR_TIMEOUT'`. backend `services/ocr.ts` `extract()` 는 AbortSignal.timeout 95s, 실패 시 `failedResult('…', 'OCR_UNAVAILABLE')`. |
| codex 비0 종료코드 / stderr 만 출력 → 에러 처리 | `codex_client.py` — exit code + stderr 검사로 위 예외 분류; 미분류는 `CodexUnavailable`. |
| codex 가 JSON 아닌 산문/마크다운 출력 → 방어 파싱 | `app/extract.py` — 첫 `{`~마지막 `}` 추출 → `json.loads`, 실패 시 ```json 펜스 재시도, 그래도 실패면 `status='failed'`, `error_code='OCR_BAD_OUTPUT'`, `raw` 보존. (`tests/test_ocr.py` 가 pure-json/codefence/prose+json/garbage 케이스 검증.) |
| JSON 인데 키 추가/누락/타입 틀림 → 정규화 + warning, 누락 null | `app/extract.py` — 알 수 없는 키 무시, 누락 키 null, 숫자필드 비숫자면 None + warning, `status='partial'`. |
| VIN 17자 아님 → 그대로 두되 warning | `app/extract.py` — VIN `re.sub('[^A-Z0-9]','',v.upper())` 후 길이 ≠ 17 이면 warning(검증으로 막지 않음). |
| 환각(이미지에 없는 값) → 사용자 검수가 최종 방어선 | `frontend/src/components/VehicleForm.tsx` — OCR 값 "자동 입력" 칩, 배너 "값을 등록증과 대조해 확인하세요", 등록증 이미지를 옆에 크게(`components/ImageViewer.tsx`). |
| 주소 줄바꿈/이중공백 → 정규화 | `app/extract.py` — 주소 `\s+`→공백, reg_no 공백 정리, year 4자리 추출. |
| 동시 다발 OCR 요청 → 직렬/소수 동시 + 과부하 429 | `app/extract.py` 모듈-레벨 `threading.Semaphore(2)`; `app/main.py` `/extract` 가 `acquire(blocking=False)` 실패 시 429 `OCR_BUSY`. backend `services/ocr.ts` 는 429 도 `failedResult` 로 폴백. |

## PDF 생성 (pypdf)

| 케이스 | 처리 위치 |
|---|---|
| 템플릿 PDF 없음/이동 → `PDF_TEMPLATE_MISSING` 500 | `ocr-service/app/fill_pdf.py` `PdfTemplateMissing` (TEMPLATE_PATH env 또는 `assets/malso_application_template.pdf`) → `app/main.py` `/fill-pdf` 500 `PDF_TEMPLATE_MISSING`. backend `routes/malso.ts` 는 502 `OCR_FILL_FAILED` 로 변환. 배포 시 포함: `Dockerfile.ocr` 가 `assets/` COPY, `TEMPLATE_PATH=/app/assets/...` 설정. |
| 필드명 불일치(특히 `vehicle_year ` 끝 공백) → 안 채워짐 | `app/fill_pdf.py` — `PDF_FIELD_NAMES` 12개 상수(끝 공백 포함)를 첫 호출 시 템플릿 `get_fields()` 와 `assert` 비교. `tests/test_ocr.py` 가 12개 전부 채워졌는지(특히 `vehicle_year `·`vehicle_vin_1==vehicle_vin_2`·`current_date`) 검증. |
| 값이 칸 너비보다 김 → NeedAppearances 로 재렌더 | `app/fill_pdf.py` — `set_need_appearances_writer(True)`. (너무 길어도 잘리지 않고 뷰어가 렌더; warning 까진 안 함 — 실무상 허용.) |
| 한글/특수문자 인코딩 → pypdf UTF-16, 안 되면 reportlab fallback | `app/fill_pdf.py` — pypdf `update_page_form_field_values` 경로로 한글 렌더 확인됨(테스트 통과). reportlab 오버레이는 설계상 fallback 으로 남겨둠(현재 불필요). |
| NeedAppearances 미설정 시 값 안 보임 → 항상 설정 | `app/fill_pdf.py` `set_need_appearances_writer(True)` 항상 호출. |
| 일부 필드만 값 / 나머지 null → 빈칸으로 정상 생성 + `X-Missing-Fields` | `app/fill_pdf.py` — None/'' → '' 로 채움, `missing_important`(`owner_name`/`vehicle_reg_no`/`vehicle_vin_1`) 반환; `app/main.py` 가 `X-Missing-Fields` 헤더로 응답. backend `routes/malso.ts` 가 그 헤더를 그대로 노출(`app.ts` CORS expose). 프론트 토스트로 안내(`pages/MalsoInputPage.tsx`). |
| 디스크 쓰기 실패(꽉 참) → `STORAGE_FULL` 500 | `backend/src/routes/malso.ts` POST `/:id/pdf` — `storage.saveGenerated` 실패 시 500 `STORAGE_FULL` + 구조화 로그. |
| 같은 차량 PDF 여러 번 생성 → 매번 새 documents 행, 최신 위 | `routes/malso.ts` — 매 생성마다 `vehicles.addDocument(kind='malso_application')`. 프론트 상세 "생성된 말소등록 신청서" 목록 최신 위(`pages/MalsoInputPage.tsx`). |

## DB

| 케이스 | 처리 위치 |
|---|---|
| 연결 끊김 / Postgres 미기동 → 풀 재시도, /health down, 503 | `backend/src/db/pool.ts` `waitForDb(maxAttempts=10)` 지수 백오프; `app.ts` `/api/health` `select 1` 실패 시 `db:'down'`. 일반 라우트의 DB 예외는 `app.ts` `errorHandler` → 500 `INTERNAL`(스택 노출 없음). |
| 마이그레이션 실패 → 부팅 중단 | `backend/src/db/migrate.ts` `runMigrations` 가 throw → `index.ts` 가 `console.error` 후 `process.exit(1)`. |
| VIN 중복(S5) → 앱 레벨 SELECT 로 기존 반환, 경합 시 23505 → 기존 SELECT | `backend/src/services/vehicles.ts` `createFromOcr` — VIN 있으면 먼저 SELECT, 있으면 그 레코드 반환; 없으면 INSERT, `23505` 잡아서 VIN 으로 재 SELECT. 부분 unique index `vehicles_vin_uniq`(`schema.sql`). |
| 매우 긴 입력값 → text 컬럼 OK, 검색 q 만 64자 제한 | `schema.sql` 컬럼 전부 `text`; `routes/malso.ts` `/search` q>64 → 400 `BAD_QUERY`. `lib/validation.ts` `validateVehicleFields` 텍스트 길이 ≤2000 가드. |
| 환경변수 누락(`DATABASE_URL` 등) → 부팅 시 변수명 명시 로그 | `backend/src/index.ts` — `DATABASE_URL`/`OCR_SERVICE_URL` 미설정 시 `console.warn` 으로 변수명 명시(step 6 보강). `db/pool.ts` 주석에 의도 기재. |

## 검색

| 케이스 | 처리 위치 |
|---|---|
| 빈 q → 빈 목록(최근 차량) / 1글자 허용 | `backend/src/services/vehicles.ts` `search` — q 빈 문자열이면 `order by updated_at desc limit` (최근 차량). `routes/malso.ts` 는 q 빈값 자체는 허용(>64 만 400). 프론트 빈 q → "최근 차량"(`pages/MalsoSearchPage.tsx`). |
| q 에 `%` `_` 따옴표 한글 공백 → ILIKE 이스케이프 + parameterized | `services/vehicles.ts` `search` — `q.replace(/\s/g,'').toLowerCase()`, `\` `%` `_` 이스케이프, `like $1 escape '\'` parameterized. (`backend/test/api.test.ts` `'%_%'` 리터럴 케이스.) |
| 결과 0건 → 빈 목록 + "결과 없음" | `pages/MalsoSearchPage.tsx` — 0건 시 "‘q’에 해당하는 차량이 없습니다" + "말소 입력에서 새로 추가" 링크. |
| 결과 매우 많음 → limit(기본 50, 최대 200), "범위를 좁히세요" | `services/vehicles.ts` limit 1..200 클램프(기본 50); `routes/malso.ts` limit 비숫자/<1 → 400 `BAD_LIMIT`. 프론트 >50 시 안내 문구. |
| 차량번호 띄어쓰기 다름 → 양쪽 공백 제거 후 비교 | `services/vehicles.ts` — 저장값·q 모두 `replace(... ,' ','')`/`replace(/\s/g,'')`; 인덱스 `vehicles_reg_no_norm_idx`/`vehicles_vin_norm_idx` 도 `lower(replace(...,' ',''))`. |

## 파일 서빙

| 케이스 | 처리 위치 |
|---|---|
| docId 없음 → 404 / DB엔 있는데 디스크 파일 없음 → 404 + 로그 | `backend/src/routes/files.ts` — `getDocumentById` 없으면 404 `NOT_FOUND`; `storage.openRead` 실패 시 404 `FILE_MISSING` + 구조화 로그. |
| 경로 traversal 시도(docId 에 `../`) → uuid 검증, 파일경로는 DB 값만 | `routes/files.ts` `isUuid(docId)` 아니면 400 `BAD_ID`; `services/storage.ts` `openRead` 가 resolve 경로 `STORAGE_DIR` prefix `assert`(traversal 가드). 저장 파일명은 UUID(`storage.save`/`saveGenerated`). |
| 큰 PDF/이미지 → 스트리밍 | `routes/files.ts` — `storage.openRead` 의 read stream 을 `pipe(res)`, stream error 핸들러 포함. |

## 배포 / 운영

| 케이스 | 처리 위치 |
|---|---|
| 환경변수 누락 → 부팅 시 명확 로그 / `CODEX_AUTH_JSON` 만 없으면 부팅은 함 | backend: `index.ts` 변수명 명시 경고. ocr-service: `app/main.py` startup 훅이 `CODEX_AUTH_JSON` 없으면 그냥 return(부팅됨), `/health` 가 `codex:'unauthenticated'` 표기. |
| Postgres 준비 안 됨(컨테이너 순서) → 재시도(backoff, 최대 N회) | `db/pool.ts` `waitForDb(10)` 지수 백오프; `docker-compose.yml` postgres healthcheck + backend `depends_on: condition: service_healthy`. |
| 포트 충돌(로컬) → 고정 포트 + README | `docker-compose.yml` 고정 포트(5173/4000/8000/5432); README `로컬 실행` 절에 명시. |
| Docker 이미지 빌드 시 codex 설치 실패 → 빌드 실패 명확 | `Dockerfile.ocr` — `npm install -g @openai/codex` (실패 시 build 중단). README 배포 절. |
| `CODEX_AUTH_JSON` 큰 값/개행 포함 → 안전 전달 | `deploy/ocr-entrypoint.sh` / `app/main.py` startup 훅 — env 값을 `printf '%s'` / 파일 write 로 그대로 기록(따옴표 처리 불필요), `chmod 600`. `render.yaml` `sync: false`. |
| 영구 디스크 미마운트 → storage 휘발 | `render.yaml` backend `disk: { mountPath: /data/storage, sizeGB: 1 }`(이 때문에 plan `starter`); README `운영 메모` 경고. |
| HTTPS/도메인 → Render 기본 도메인, CORS env 설정 | `render.yaml` — `CORS_ORIGIN`/`OCR_SERVICE_URL`/`BACKEND_URL` 을 `*.onrender.com` 으로 배선; `app.ts` CORS 는 `CORS_ORIGIN` env 만 허용. README 에 이름 충돌 시 수정 안내. |

## UX / 프론트엔드 엣지

| 케이스 | 처리 위치 |
|---|---|
| OCR 진행 중 사용자가 같은 필드 입력 → 그 필드 OCR 결과 무시 | `frontend/src/lib/merge.ts` `mergeOcrFields` — `touched` 집합 + 비어있는 필드에만 채움; `components/VehicleForm.tsx` 가 touched/dirty ref 추적. (`src/test/merge.test.ts`.) |
| OCR 중 새로고침/뒤로가기 → 응답 전이면 레코드 없음, 후면 `/malso/:id` 복구 | `pages/MalsoInputPage.tsx` — 업로드 성공 시 `navigate('/malso/:id', replace)`; 새로고침하면 `useVehicle(id)` 로 복구, "작성 중" 목록(`useSearch('')` draft 필터)에도 노출. |
| "분석 취소" → codex 는 서버에서 끝까지, 결과는 버림, UI 즉시 수동 모드 | `pages/MalsoInputPage.tsx` `analyzeCancelled` ref — 응답 도착해도 무시; `VehicleForm.tsx` 배너에서 "분석 취소" 노출. |
| 자동 저장 race → 디바운스, in-flight 1개, 마지막 값 수렴, 실패 누적 시 경고 | `components/VehicleForm.tsx` — 0.8s 디바운스 PATCH, blur flush, in-flight 1개 + 실패 시 재큐, "저장 중…/저장됨 HH:MM" + "저장 실패—다시 저장". `lib/useDebounce.ts`. |
| 같은 차량 두 탭/두 사람 동시 편집 → last-write-wins | `services/vehicles.ts` `update` 가 `updated_at = now()`; 충돌 감지 안 함(ADR-004 규모 수용). 검색·상세는 `updated_at desc` 로 최신만. |
| PDF 미리보기를 브라우저가 못 염 → 다운로드 링크 폴백 + 안내 | `components/PdfPreviewModal.tsx` — `<object>` 임베드 실패 시 다운로드 링크 폴백 + "다운로드/인쇄" 버튼. |
| 큰 이미지 업로드(느린 네트워크) → 진행 표시 / 타임아웃 재시도 | `pages/MalsoInputPage.tsx` — 업로드 즉시 로컬 objectURL 미리보기 + "분석 중" 배너; 업로드 실패 시 에러 토스트 + "재시도"(`components/Toast.tsx`). (업로드 진행률 바는 best-effort 미구현 — fetch 기반.) |
| 검색 빠른 타이핑 → 디바운스 + stale 무시, 빈 q 면 최근 차량 | `pages/MalsoSearchPage.tsx` — `useDebounce(q, 300)`; `api/hooks.ts` `useSearch` `keepPreviousData`(stale-safe); 빈 q → 최근 차량. |
| 이미지 뷰어: 큰 이미지 메모리 / 회전은 표시용만 | `components/ImageViewer.tsx` — 휠/버튼 줌, 드래그 팬, 90° 회전(표시용 transform 만 — 원본 파일 안 바꿈), 리셋, 원본 다운로드, 썸네일. |
| 모달/토스트 떠 있는 채 라우트 이동 → 정리 | `components/ConfirmModal.tsx` (Esc/언마운트 정리), `components/Toast.tsx`(타이머 정리), `pages/MalsoInputPage.tsx` 라우트 변경 effect 가 localFile/ocr 상태 클리어. |
| PDF 만들기 연타 → 버튼 1회만 | `components/VehicleForm.tsx` — 버튼 `disabled` while `generatePdf` pending(`api/hooks.ts` mutation). (멱등 아님 — UI 차단이 1차 방어, ARCHITECTURE 명시.) |
| 첨부 이미지 여러 장인데 OCR 은 첫 장만 | `pages/MalsoInputPage.tsx` — "이미지 추가 첨부"(OCR 재실행 안 함), "다시 분석"만 명시적 재 OCR; 첨부 목록·뷰어 썸네일로 다른 장 열람. README/UI 카피에 "OCR 은 첫 번째 이미지 기준" 취지(상태 C 안내). |

---

## 자동 검증 (Stop 훅 = `npm run lint && npm run build && npm run test`)

- `npm run lint` — frontend + backend eslint, clean.
- `npm run build` — frontend `tsc -b && vite build`, backend `tsc && cp schema.sql`, clean.
- `npm run test` — frontend vitest(merge/format 11), backend vitest(health 1 pass; api 11 + migrate 1 은 `DATABASE_URL` 없으면 skip — postgres 있는 환경에서 전부 pass 확인됨), ocr-service `python3 -m pytest`(15 pass).
- `docker compose up --build` 기반 S1~S5 / 에러 표본 / UX 표본 수동 동선: **이 환경에 Docker 없음** → 위 표의 코드 위치 점검으로 갈음(step 0~5 산출물에서 postgres+backend+ocr 로컬 구동 시 동선 통과 기록 있음).
</content>
</invoke>
