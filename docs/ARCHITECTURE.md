# 아키텍처 — Totaload ERP

> 이 문서는 `phases/0-mvp/step0` 에서 마스터 계획서 2절(2.1~2.8)을 옮겨 작성했다. 이후 모든 step 의 가드레일로 주입된다. step 파일은 이 구조에서 벗어나면 안 된다.

## 2.1 시스템 구성
```
[Browser/React SPA]  ──HTTP/JSON, multipart──>  [Node API (Express/TS)]
                                                    │  ├─ PostgreSQL (pg pool)
                                                    │  ├─ 디스크 스토리지 (storage/  업로드 이미지·생성 PDF)
                                                    │  └──HTTP──> [Python OCR/PDF Service (FastAPI)]
                                                                      ├─ subprocess: `codex exec ... -i <img>`  (OCR)
                                                                      └─ pypdf: 템플릿 PDF AcroForm 채우기
```
- **frontend**: 정적 SPA. API 호출만. (Render Static Site / 로컬은 vite dev.)
- **backend (Node)**: 단일 진실의 출처. 업로드 수신·검증, 파일 저장, DB CRUD, OCR 서비스 호출, PDF 생성 호출, 검색. 프론트는 OCR 서비스를 직접 호출하지 않는다.
- **ocr-service (Python)**: 무상태. ① `/extract`: 이미지 → codex CLI → 정규화된 JSON. ② `/fill-pdf`: 필드값 JSON → 채워진 PDF 바이트. ③ `/health`. codex 인증 부트스트랩(아래 2.6).
- **PostgreSQL**: `vehicles`, `documents`.
- **디스크 스토리지**: backend 에 마운트된 영구 디스크의 `storage/` (하위 `uploads/`, `generated/`).

## 2.2 디렉토리 구조 (monorepo, npm workspaces)
```
frontend/                React + Vite + TS + Tailwind
  src/{pages,components,api,lib,types}
backend/                 Node + Express + TS
  src/{routes,services,db,lib,types}/  src/index.ts
  src/db/schema.sql       (idempotent CREATE TABLE IF NOT EXISTS ...)
  test/                   (supertest e2e; ocr-service 모킹)
ocr-service/             Python + FastAPI
  app/{main.py,extract.py,fill_pdf.py,codex_client.py,schema.py}
  tests/                  pytest
  requirements.txt        fastapi uvicorn pypdf python-multipart pillow pydantic pypdfium2 httpx pytest reportlab
assets/                  malso_application_template.pdf, samples/ (샘플 등록증 이미지)
db/                      (스키마는 backend/src/db/schema.sql 에; db/ 는 비워두거나 docs)
storage/                 (gitignore; 런타임 생성: uploads/, generated/)
docs/                    PRD/ARCHITECTURE/ADR/UI_GUIDE
Dockerfile.frontend  Dockerfile.backend  Dockerfile.ocr
docker-compose.yml       로컬: frontend, backend, ocr-service, postgres
render.yaml              배포 Blueprint
package.json             workspaces + lint/build/test 위임 스크립트
.env.example
README.md
```
- 루트 `package.json` 스크립트: `lint`(각 워크스페이스 lint), `build`(frontend+backend build), `test`(`npm -ws run test` + `cd ocr-service && pytest`). Stop 훅(`npm run lint && npm run build && npm run test`)이 전체를 돈다.

## 2.3 데이터 흐름

**A. 말소 입력 — 업로드→추출**
```
React: 파일 선택 → POST /api/malso (multipart: file)
 → backend: 검증(타입/크기/매직바이트) → UUID 로 storage/uploads/ 저장
   → POST ocr-service /extract (이미지 경로 또는 바이트) → 정규화 JSON 수신(또는 에러)
   → DB: vehicles INSERT (raw_ocr=원시응답, 추출필드, status='draft')
       단 VIN 추출됐고 동일 VIN vehicle 이미 있으면 → 그 레코드 반환(중복 방지)
   → DB: documents INSERT (kind='registration_cert', file_path)
 → 응답: { vehicle, fields, ocrStatus: 'ok'|'partial'|'failed', warnings:[...] }
React: 폼에 fields 바인딩, 빈 필드 강조, 이미지 미리보기
```

**B. 말소 입력 — 저장 / PDF 생성**
```
React: 폼 편집 → PATCH /api/malso/:id { fields }  → backend: vehicles UPDATE → 갱신본 반환
React: "PDF 생성" → POST /api/malso/:id/pdf
 → backend: 현재 vehicles row → 필드 매핑(2.5 표) → POST ocr-service /fill-pdf {fields}
   → ocr-service: assets/템플릿 PDF 열기 → AcroForm 필드 채움(NeedAppearances=true) → PDF bytes
 → backend: storage/generated/ 에 저장 → documents INSERT(kind='malso_application') → vehicles.status='completed'
 → 응답: PDF 스트림(Content-Disposition: attachment; filename="말소등록신청서_<차량번호>_<YYYYMMDD>.pdf")
```

**C. 검색**
```
React: q 입력(디바운스 300ms) → GET /api/malso/search?q=...&limit=50
 → backend: SELECT ... WHERE replace(reg_no,' ','') ILIKE %q% OR replace(vin,' ','') ILIKE %q%  (parameterized)
 → 응답: [{id, reg_no, vin, model, status, created_at}]  (SSN 없음)
React: 목록 → 행 클릭 → GET /api/malso/:id → { vehicle(전체), documents:[{id,kind,filename,url}] }
```

## 2.4 데이터 모델 (PostgreSQL)

```sql
-- vehicles
id            uuid primary key default gen_random_uuid()
reg_no        text                       -- 자동차등록번호 (정규화: 공백 1개 형식 유지)
vin           text                       -- 차대번호(대문자/숫자)
owner_name    text
owner_ssn     text                       -- 주민/법인등록번호 (민감)
owner_address text
model         text                       -- 차명
year          text                       -- 형식 및 연식 (4자리 또는 원문)
mileage       integer                    -- km, nullable
weight        integer                    -- 차량중량(kg), nullable
total_weight  integer                    -- 차량총중량(kg), nullable
app_date      text                       -- current_date 용 (기본 today, 사용자 수정 가능)
note          text                       -- 자유 메모/비고 (PDF 무관, 검색 대상 아님)
raw_ocr       jsonb                       -- codex 원시 응답 + 파싱 메타(성공/부분/실패, warnings)
ocr_status    text not null default 'failed'  -- 'ok'|'partial'|'failed'
status        text not null default 'draft'   -- 'draft'|'completed'
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
-- 인덱스: (lower(replace(reg_no,' ',''))), (lower(replace(vin,' ',''))) 부분일치용. updated_at desc.
-- vin 이 있을 때 중복 방지는 앱 레벨 조회(부분 unique index: where vin is not null and vin <> '')

-- documents
id          uuid primary key default gen_random_uuid()
vehicle_id  uuid not null references vehicles(id) on delete cascade
kind        text not null              -- 'registration_cert' | 'malso_application'
file_path   text not null              -- storage/ 기준 상대경로 (uploads/<uuid>.jpg ...)
orig_name   text                       -- 사용자 업로드 원본 파일명(표시용; 저장경로엔 안 씀)
mime        text not null
size_bytes  integer not null
created_at  timestamptz not null default now()
-- 인덱스: (vehicle_id)
```
- 마이그레이션: `backend/src/db/schema.sql` 을 backend 시작 시 1회 실행(`CREATE EXTENSION IF NOT EXISTS pgcrypto;` + `CREATE TABLE IF NOT EXISTS ...` + `CREATE INDEX IF NOT EXISTS ...`). 멱등.

## 2.5 API 명세 (Node backend)

모든 응답 에러 형태: `{ error: { code: string, message: string, details?: any } }` + 적절한 HTTP 코드. 성공은 위 데이터 흐름의 형태.

| 메서드·경로 | 입력 | 정상 | 주요 에러 |
|---|---|---|---|
| `GET /api/health` | — | `{status:'ok', db:'ok', ocr:'ok'\|'down'}` | — |
| `POST /api/malso` | multipart `file` | `{vehicle, fields, ocrStatus, warnings}` 201 | 400 파일없음/타입오류/너무큼; ocr-service 다운 시 이미지는 저장하고 빈 fields + ocrStatus='failed' 로 반환(업무 안 막음); 500 DB |
| `GET /api/malso/:id` | — | `{vehicle, documents}` | 404 없음 |
| `PATCH /api/malso/:id` | `{fields:{...}}` | `{vehicle}` | 404; 400 검증(숫자필드 형식, 길이) |
| `POST /api/malso/:id/pdf` | (옵션 `{fields}` 로 마지막 편집 즉시 반영) | `application/pdf` 스트림 | 404; 400 필수값 누락 시 — 막지 않고 빈칸 채워 생성(경고 헤더 `X-Missing-Fields`); 502 ocr-service; 500 |
| `GET /api/malso/search?q=&limit=` | `q`(1~64자), `limit`(기본 50, 최대 200) | `[{id,reg_no,vin,model,status,created_at}]` | 400 q 빈값/너무 김 |
| `GET /api/files/:docId` | — | 파일 스트림(이미지/PDF, inline 또는 attachment) | 404 docId 없음 / 디스크에 파일 없음 |
| `DELETE /api/malso/:id` | — | 204 | 404 — *MVP 미포함 후보(§7)* |

ocr-service 내부 API: `POST /extract`(multipart image → `{fields, raw, status, warnings}`), `POST /fill-pdf`(`{fields}` JSON → `application/pdf`), `GET /health`.

## 2.6 codex CLI 통합 (가장 위험한 부분 — 상세)

- **호출**: ocr-service 가 `subprocess.run(["codex","exec", <prompt>, "-i", <image_path>, "--sandbox","read-only", "--skip-git-repo-check", ... ], timeout=90, cwd=<temp dir>)`. 정확한 플래그명은 ADR-002 의 "확인된 codex CLI 인터페이스" 메모 참조(`-i/--image`, `-s/--sandbox`, `--skip-git-repo-check`, `--output-last-message <FILE>`, `--json`, `--output-schema <FILE>`). 이미지 입력 미지원이면 step `blocked`.
- **프롬프트 설계**: "당신은 한국 자동차등록증 OCR 추출기다. 첨부 이미지에서 아래 키만 가진 JSON 객체 하나만 출력하라. 코드펜스·설명·다른 텍스트 금지. 값을 못 읽으면 null. 키: owner_name, owner_ssn, owner_address, vehicle_reg_no, vehicle_vin, vehicle_model, vehicle_year, vehicle_mileage(정수 km 또는 null), vehicle_weight(공차중량 정수 또는 null), vehicle_total_weight(총중량 정수 또는 null). VIN 은 공백 없는 대문자/숫자. 주소는 한 줄. 숫자는 콤마 없이." (vin 은 하나만 받아 backend 에서 vin_1=vin_2 로 복제.)
- **출력 파싱(방어적)**: ① 응답에서 codex 의 부가 출력(추론 로그/`tokens used` 등)을 걷어내고 첫 `{`~마지막 `}` 구간 추출 → `json.loads`. ② 실패 시 코드펜스(```json ... ```) 추출 재시도. ③ 그래도 실패면 `status='failed'`, `fields` 전부 null, `raw` 에 원문 보관. ④ JSON 은 됐지만 키 일부 누락/타입 불일치 → 누락 키 null, `status='partial'`, `warnings` 에 기록. ⑤ 모든 키가 채워지면 `status='ok'`(그래도 backend·프론트는 항상 사용자 검수 전제).
- **값 정규화(ocr-service)**: VIN → `re.sub(r'[^A-Z0-9]','', v.upper())`; 숫자필드 → 콤마/단위/공백 제거 후 `int()`(실패 시 null + warning); 주소 → 개행→공백, 연속공백 1개; reg_no → 공백 정리; year → 4자리 추출 가능하면 그것, 아니면 원문.
- **인증**: ocr-service 컨테이너 시작 스크립트가 `if [ -n "$CODEX_AUTH_JSON" ]; then mkdir -p ~/.codex && printf '%s' "$CODEX_AUTH_JSON" > ~/.codex/auth.json && chmod 600 ~/.codex/auth.json; fi` 실행. 로컬 개발은 호스트의 `~/.codex` 를 컨테이너에 read-only 마운트하거나 같은 env 사용.
- **인증 만료/요금**: ChatGPT auth 토큰 만료 시 codex 가 인증 에러 → `/extract` 가 `code:'OCR_AUTH'` 에러 → backend 는 이미지 저장 + 빈 폼 + 안내 메시지 반환(업무 안 막음). README 에 `CODEX_AUTH_JSON` 갱신 절차 기재. 사용량은 사용자 ChatGPT 구독 한도/요금에 종속(ADR-008).
- **이미지 전처리**: 20MB 초과 거부, 그 외엔 Pillow 로 장변 ~2000px 로 다운스케일 후 codex 에 전달(토큰/시간 절감). 원본은 storage 에 그대로 보관.
- **동시성·타임아웃**: 동기 호출, 90초 타임아웃. 타임아웃/크래시 → `code:'OCR_TIMEOUT'` 에러 → 빈 폼 폴백. (향후 개선: 잡 큐로 비동기화 — ADR-009.)

## 2.7 에러 처리 전략 (계층)
- **frontend**: 모든 API 호출에 로딩/에러 상태. 업로드 전 클라이언트단 1차 검증(타입/크기). OCR 실패·부분 시 inline 배너 + 폼은 계속 사용 가능. 네트워크 오류 재시도 버튼. PDF 다운로드 실패 시 메시지.
- **backend**: 입력 검증 미들웨어(zod/유사) → 400. multer 파일 제한 → 413/400. ocr-service 호출은 `try/catch` + 타임아웃; 실패해도 업로드 흐름은 200 으로 완료(이미지 저장됨, fields 빈값, ocrStatus 표기). DB 오류 → 500 + 로그. 알 수 없는 예외 → 500 일반 메시지(스택 노출 금지). 모든 에러 구조화 로그.
- **ocr-service**: 입력 이미지 검증; codex 미설치/미인증/타임아웃/비JSON 각각 구분된 에러 코드; pypdf 예외(템플릿 없음/필드명 불일치/렌더링) 구분. 절대 크래시로 죽지 않게 try/except 후 JSON 에러 반환.
- **DB**: 풀 + 재연결; 마이그레이션 실패 시 backend 부팅 중단 + 명확 로그.
- **배포**: 각 서비스 `/health`; backend 는 부팅 시 DB 마이그레이션, ocr-service 도달성 체크(실패해도 부팅은 함, /health 에 표기).

## 2.8 에러·엣지 케이스 카탈로그 (구현 시 전부 다뤄야 함)

**업로드/입력**
- 파일 없음 / 빈 파일(0바이트) → 400.
- 허용 외 타입(.docx, .heic, .txt, 실행파일) → 400. (HEIC 는 안내: JPG/PNG/PDF 로 변환 요청.)
- MIME 위조(확장자만 .jpg, 내용은 다름) → 매직바이트 검사로 거부.
- 20MB 초과 → 413/400.
- 손상된 이미지 / 잘린 JPEG → ocr-service 의 Pillow 열기 실패 → `OCR_BAD_IMAGE` → 빈 폼 폴백.
- PDF 업로드(스캔본) → 허용. ocr-service 가 첫 페이지만 `pypdfium2` 로 이미지 렌더 후 처리(멀티페이지면 1페이지만 — ADR-010). 렌더 실패 → 빈 폼 폴백.
- 회전/뒤집힌 이미지, 저해상도, 흐림, 그림자/반사 → codex 가 부분 추출 → `partial`. 사용자가 보정.
- 등록증이 아닌 이미지(다른 서류/사진) → codex 가 대부분 null → `partial`/`failed`. 막지 않음.
- 영업용/이륜/특수 차량 등 등록증 양식 변형, 구버전 등록증, 가려진 칸 → 부분 추출.
- 매우 큰 해상도(예: 8000px) → 다운스케일.

**OCR / codex**
- `codex` 미설치 → `/extract` `OCR_UNAVAILABLE`; `/health` 가 down. backend 폴백.
- 미인증(`CODEX_AUTH_JSON` 없음/잘못됨) / 토큰 만료 → `OCR_AUTH`. 폴백 + README 안내.
- ChatGPT 사용량/속도 한도 초과 → `OCR_RATE_LIMIT`. 폴백 + "잠시 후 재시도".
- 타임아웃(>90s) → `OCR_TIMEOUT`. 폴백.
- codex 비0 종료코드 / stderr 만 출력 → 에러로 처리.
- codex 가 JSON 아닌 산문/마크다운/추가설명 출력 → 방어 파싱(2.6 ③).
- JSON 인데 키 추가/누락/오타, 값 타입 틀림(숫자 자리에 "약 12,000km") → 정규화 + warning, 누락은 null.
- VIN 17자 아님/체크섬 비정상 → 그대로 두되 warning(검증으로 막지 않음 — 구형/특수차 가능).
- 환각(이미지에 없는 그럴듯한 값) → 사용자 검수가 최종 방어선. UI 에 "OCR 결과는 반드시 확인하세요" 고지.
- 주소에 줄바꿈/이중공백 → 정규화.
- 동시 다발 OCR 요청 → ocr-service 가 직렬/소수 동시 처리(uvicorn workers 제한 or 세마포어). 과부하 시 429.

**PDF 생성(pypdf)**
- 템플릿 PDF 파일 없음/이동됨 → `PDF_TEMPLATE_MISSING` 500 (배포 시 assets 포함 확인 — Step 0/5).
- 필드명 불일치(특히 `"vehicle_year "` 끝 공백 누락, 대소문자) → 채워지지 않음. → Step 2 에서 `r.get_fields()` 키를 상수로 박고 단위테스트로 12개 전부 채워졌는지 검증.
- 값이 칸 너비보다 김(긴 주소·차명) → `NeedAppearances=true` 로 뷰어가 다시 렌더; 너무 길면 warning.
- 한글/특수문자 인코딩 → pypdf 가 UTF-16 처리. 표준 폰트로 한글 렌더 안 되면 Step 2 에서 `reportlab` 오버레이로 대체(설계 fallback).
- `NeedAppearances` 미설정 시 일부 뷰어에서 값 안 보임 → 항상 설정.
- 일부 필드만 값 있고 나머지 null → null/"" 은 빈칸으로 두고 정상 생성(헤더 `X-Missing-Fields`).
- 생성 중 디스크 쓰기 실패(꽉 참) → `STORAGE_FULL` 500.
- 같은 차량 PDF 여러 번 생성 → 매번 새 documents 행(이력 보존), 상세에서 최신 것 위에 표시.

**DB**
- 연결 끊김/Postgres 미기동 → 풀 재시도, /health down, 사용자엔 503.
- 마이그레이션 실패 → 부팅 중단.
- VIN 중복(S5) → 앱 레벨 SELECT 로 기존 반환. 경합으로 둘 다 INSERT 되면 부분 unique index(`where vin is not null and vin<>''`)로 두 번째 INSERT 가 23505 → 잡아서 기존 행 SELECT 반환.
- 매우 긴 입력값 → 컬럼은 text 라 OK, 단 검색 q 는 64자 제한.

**검색**
- 빈 q → 400(또는 빈 목록). 1글자 → 허용(부분일치).
- q 에 `%`, `_`, 따옴표, 한글, 공백 → ILIKE 패턴 이스케이프(`%`,`_` → `\%`,`\_`), parameterized.
- 결과 0건 → 빈 목록 + "결과 없음".
- 결과 매우 많음 → limit(기본 50, 최대 200), "더 보기"는 MVP 에선 생략(메시지로 "범위를 좁히세요").
- 차량번호를 띄어쓰기 다르게 입력("123가4567" vs "123 가 4567") → 양쪽 공백 제거 후 비교.

**파일 서빙**
- docId 없음 → 404. DB엔 있는데 디스크 파일 없음(유실) → 404 + 로그.
- 경로 traversal 시도(docId 에 `../`) → docId 는 uuid 검증, 파일경로는 DB 값만 사용.
- 큰 PDF/이미지 → 스트리밍.

**배포/운영**
- 환경변수 누락(`DATABASE_URL`, `OCR_SERVICE_URL`, `CODEX_AUTH_JSON`) → 부팅 시 명확한 에러 로그(어떤 변수가 없는지). `CODEX_AUTH_JSON` 만 없으면 부팅은 하되 OCR 비활성.
- Postgres 가 아직 준비 안 됨(컨테이너 순서) → backend 가 연결 재시도(backoff, 최대 N회).
- 포트 충돌(로컬) → docker-compose 에 고정 포트, README 명시.
- Docker 이미지 빌드 시 `codex` 설치 실패 → 빌드 실패를 명확히. (설치 방법: `npm i -g @openai/codex` 또는 공식 스크립트 — Step 5 에서 확인.)
- `CODEX_AUTH_JSON` 이 너무 큰 값/개행 포함 → env 로 안전히 전달(따옴표/`printf '%s'`).
- 영구 디스크 미마운트 시 storage 가 재배포마다 날아감 → render.yaml 에 disk 정의, README 경고.
- HTTPS/도메인 → Render 기본 도메인 사용. CORS 오리진을 배포 도메인으로 env 설정.

**UX / 프론트엔드 엣지**
- OCR 진행 중 사용자가 같은 필드 입력 → 그 필드는 OCR 결과 무시(덮어쓰기 금지). 만진 필드 집합으로 판별.
- OCR 진행 중 새로고침/뒤로가기 → 업로드 응답 전이면 vehicle 레코드 없음(다시 업로드 필요), 응답 후면 `/malso/:id` 로 복구(작성 중 목록에도 노출). OCR 작업 자체는 서버에서 동기 처리 중이라 새로고침하면 그 결과를 못 받음 → "다시 분석"으로 재시도하거나 수동 입력.
- "분석 취소" → 진행 중 codex subprocess 는 서버에서 끝까지 돌 수 있으나 결과는 버림; UI 는 즉시 수동 입력 모드.
- 자동 저장 race(연속 타이핑) → 디바운스, in-flight 1개만, 마지막 값으로 수렴. 저장 실패 누적 시 명확 경고 + 수동 "다시 저장".
- 같은 차량을 두 탭/두 사람이 동시 편집 → last-write-wins(소규모 팀 수용, 충돌 감지 안 함). updated_at 으로 최신만 표시.
- PDF 미리보기를 브라우저가 못 염(팝업 차단/내장 PDF 뷰어 없음) → 다운로드 링크 폴백 + 안내.
- 큰 이미지 업로드(느린 네트워크) → 가능하면 업로드 진행률, 타임아웃 시 재시도 버튼.
- 검색 빠른 타이핑 → 디바운스 + 응답 순서 보장(stale 무시), 빈 q 면 최근 차량.
- 이미지 뷰어: 매우 큰 이미지 메모리/렌더 → 표시용 다운스케일 + max 크기 제한. 회전 상태는 표시용만(원본 파일 안 바꿈).
- 모달/토스트가 떠 있는 채 라우트 이동 → 정리(닫기).
- 사용자가 PDF 만들기를 연타 → 버튼 비활성으로 1회만; 중복 호출 시 멱등 아님(매번 새 PDF 행) → UI 에서 차단이 1차 방어.
- 첨부 이미지가 여러 장인데 OCR 은 첫 장만 → UI 에 "OCR 은 첫 번째 이미지 기준" 명시, 다른 장은 보기·mileage 참고용.

## 패턴 / 상태 관리 (요약)
- frontend: React 함수형 컴포넌트 + Hooks. 서버 상태는 fetch 후 컴포넌트 상태로 보관(전역 상태 라이브러리 미도입 — MVP 규모). 라우팅은 클라이언트 라우터(`/`→`/malso/new`, `/malso/:id`, `/malso/search`).
- backend: Express 라우터 + 서비스 레이어(`services/`) + DB 레이어(`db/`). 외부 호출(ocr-service)은 `services/ocr.ts` 한 곳에 캡슐화.
- ocr-service: FastAPI 라우트 + 모듈 분리(`extract.py`, `fill_pdf.py`, `codex_client.py`, `schema.py`). 무상태.
- 스토리지 접근은 함수로 추상화(향후 S3 전환 여지 — ADR-006).
