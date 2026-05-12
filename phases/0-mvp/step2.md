# Step 2: ocr-service

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` — §2.1(구성), §2.3(데이터 흐름 A·B), §2.4(필드), §2.5(ocr-service 내부 API), **§2.6(codex CLI 통합 — 정독)**, §2.7·§2.8(에러/엣지: OCR·PDF 부분 전부).
- `docs/ADR.md` — ADR-002(codex OCR), ADR-003(pypdf), ADR-008(codex 인증), ADR-010(PDF 1페이지만).
- `docs/PRD.md` — §1.4(폼필드 ↔ 등록증 매핑표 — 12개와 처리 규칙).
- `CLAUDE.md` — 1부 원칙.
- `assets/malso_application_template.pdf` — 채울 템플릿. `python3 -c "from pypdf import PdfReader; print(sorted(PdfReader('assets/malso_application_template.pdf').get_fields()))"` 로 12개 필드명 확인(특히 `'vehicle_year '` 끝 공백).
- `assets/samples/*.jpg` — 샘플 자동차등록증.
- `ocr-service/` — step0 의 FastAPI 스캐폴드.
- step0 이 ADR.md 에 기록한 "확인된 codex CLI 인터페이스" 메모.

## 작업

ocr-service(Python/FastAPI) 본체. 무상태. 엔드포인트 3개: `GET /health`, `POST /extract`, `POST /fill-pdf`. **2.6·2.8 의 OCR/PDF 관련 에러·엣지 케이스를 전부 코드로 다뤄라.**

### 0. 시작 시 codex 인증 부트스트랩
`app/main.py` 의 startup 에서: `CODEX_AUTH_JSON` env 가 비어있지 않으면 `~/.codex/auth.json` 에 그 내용을 그대로 기록(`mkdir -p ~/.codex`, `chmod 600`). 비어있으면 아무것도 안 함(로컬은 호스트 ~/.codex 사용).

### 1. `app/schema.py` (pydantic)
- `ExtractedFields`: `owner_name: str|None`, `owner_ssn: str|None`, `owner_address: str|None`, `vehicle_reg_no: str|None`, `vehicle_vin: str|None`, `vehicle_model: str|None`, `vehicle_year: str|None`, `vehicle_mileage: int|None`, `vehicle_weight: int|None`, `vehicle_total_weight: int|None`. (전부 Optional, 기본 None.)
- `ExtractResponse`: `fields: ExtractedFields`, `raw: str`(codex 원문 또는 에러 메시지), `status: Literal['ok','partial','failed']`, `warnings: list[str]`, `error_code: str|None`(예 `OCR_UNAVAILABLE`/`OCR_AUTH`/`OCR_RATE_LIMIT`/`OCR_TIMEOUT`/`OCR_BAD_OUTPUT`/`OCR_BAD_IMAGE`/`None`).
- `FillPdfRequest`: 논리 필드 — `owner_name, owner_ssn, owner_address, vehicle_reg_no, vehicle_vin, vehicle_model, vehicle_year, vehicle_mileage, vehicle_weight, vehicle_total_weight, current_date` (모두 str|None; 숫자도 str 로 받아 그대로 PDF 텍스트로 씀).

### 2. `app/codex_client.py`
- 상수: `CODEX_CMD` 등 — step0 이 확인한 실제 플래그를 사용해 명령을 구성한다(예시: `codex exec <prompt> --image <path> --ask-for-approval never --sandbox read-only --skip-git-repo-check`). **step0 메모와 다르면 실제 `codex exec --help` 를 다시 확인해 맞춰라.**
- 프롬프트(시스템성): "당신은 한국 자동차등록증 OCR 추출기다. 첨부 이미지에서 아래 키만 가진 JSON 객체 하나만 출력하라. 코드펜스·설명·다른 텍스트 금지. 값을 못 읽으면 null. 키: owner_name, owner_ssn, owner_address, vehicle_reg_no, vehicle_vin, vehicle_model, vehicle_year, vehicle_mileage(정수 km 또는 null), vehicle_weight(공차중량 정수 또는 null), vehicle_total_weight(총중량 정수 또는 null). vehicle_vin 은 공백 없는 영문 대문자/숫자. owner_address 는 한 줄. 숫자는 콤마 없이 정수만."
- `run_codex_ocr(image_path: str) -> str`: 임시 cwd 에서 `subprocess.run(..., capture_output=True, text=True, timeout=90)`. 비0 종료/타임아웃/stderr-only/인증 패턴/한도 패턴을 각각 구분해 typed 예외 raise: `CodexUnavailable`(미설치: FileNotFoundError 등), `CodexAuth`(인증 관련 출력), `CodexRateLimit`, `CodexTimeout`(TimeoutExpired), `CodexBadOutput`(빈 출력). 성공이면 stdout 반환.
- `codex_health() -> str`: `'ok'`/`'missing'`/`'unauthenticated'`/`'unknown'` — 가볍게 `codex --version` 정도 + ~/.codex/auth.json 존재 여부로 판단(실제 OCR 호출은 안 함).
- **codex 가 이미지 입력을 전혀 지원하지 않는 것으로 확인되면**: 이 step 을 `blocked` 로 두고 `blocked_reason` 에 "codex CLI 가 이미지 입력을 지원하지 않음 — OCR 방식 재논의 필요(대안: OpenAI Vision API 키)" 라고 적고 즉시 중단하라. 그 외(미설치/미인증)는 블록 사유가 아니다(아래 참조).

### 3. `app/extract.py`
- `extract_from_upload(data: bytes, filename: str) -> ExtractResponse`:
  1. 이미지 검증: 매직바이트/Pillow `Image.open` 시도. PDF 면 `pypdfium2` 로 1페이지만 PNG 렌더(멀티페이지여도 1페이지). 열기 실패 → `ExtractResponse(status='failed', error_code='OCR_BAD_IMAGE', raw='...', fields=all None)`.
  2. 다운스케일: 장변 ~2000px(이미 작으면 그대로). PNG/JPEG 로 임시 저장.
  3. `run_codex_ocr(temp_path)` 호출. 예외 → 해당 `error_code` 로 `status='failed'` 응답(절대 raise 밖으로 던지지 마라). `CodexUnavailable`→`OCR_UNAVAILABLE`, `CodexAuth`→`OCR_AUTH`, `CodexRateLimit`→`OCR_RATE_LIMIT`, `CodexTimeout`→`OCR_TIMEOUT`, `CodexBadOutput`→`OCR_BAD_OUTPUT`.
  4. 출력 파싱(방어적): 원문에서 첫 `{` ~ 마지막 `}` 구간 추출 → `json.loads`. 실패 시 ```` ```json ... ``` ```` 코드펜스 추출 재시도. 그래도 실패 → `status='failed'`, `error_code='OCR_BAD_OUTPUT'`, `raw=원문`.
  5. 스키마 매핑 + 정규화: `vehicle_vin` → `re.sub(r'[^A-Z0-9]','', v.upper())`(빈문자면 None); 숫자 필드(`vehicle_mileage/weight/total_weight`) → 콤마·단위·공백 제거 후 `int()`(실패 시 None + warning); `owner_address` → 개행→공백, 연속 공백 1개; `vehicle_reg_no` → 양끝/중간 잡공백 정리; `vehicle_year` → 4자리 연도 추출되면 그것, 아니면 원문 문자열.
  6. status: 키가 (실질적으로) 다 채워졌으면 `'ok'`, 일부 None/누락이면 `'partial'`, JSON 자체 실패면 `'failed'`. warnings 에 무엇이 비었는지 등 기록.
  - 반환은 항상 `ExtractResponse` (예외 없음).
- 동시성 제한: 모듈 레벨 `asyncio.Semaphore(2)`(또는 1) — 초과 시 `/extract` 가 429.

### 4. `app/fill_pdf.py`
- 상수 `PDF_FIELD_NAMES = ['owner_name','owner_ssn','owner_address','vehicle_reg_no','vehicle_vin_1','vehicle_vin_2','vehicle_model','vehicle_year ','vehicle_mileage','vehicle_weight_1','vehicle_weight_2','current_date']` — **`'vehicle_year '` 끝 공백 정확히 그대로.** import 시(또는 첫 호출 시) 템플릿의 `get_fields()` 키 집합과 일치하는지 assert(불일치면 명확한 에러).
- 템플릿 경로: `os.environ.get('TEMPLATE_PATH')` 또는 리포 기준 `assets/malso_application_template.pdf`. 없으면 `PdfTemplateMissing` 예외 → 라우트가 500.
- `fill(req: FillPdfRequest) -> bytes`:
  - 논리→PDF 매핑: `owner_name→owner_name`, `owner_ssn→owner_ssn`, `owner_address→owner_address`, `vehicle_reg_no→vehicle_reg_no`, `vehicle_vin→vehicle_vin_1` **및** `vehicle_vin_2`(같은 값), `vehicle_model→vehicle_model`, `vehicle_year→'vehicle_year '`, `vehicle_mileage→vehicle_mileage`, `vehicle_weight→vehicle_weight_1`, `vehicle_total_weight→vehicle_weight_2`(없으면 `vehicle_weight` 복제), `current_date→current_date`(없거나 빈값이면 오늘 `f"{y}년 {m}월 {d}일"`).
  - `None`/빈값은 `''`(빈칸)으로 둔다 — 막지 않고 빈 채로 생성. 빈 "중요" 필드 목록(`vehicle_vin_1`, `vehicle_reg_no`, `owner_name` 등)을 부수적으로 반환할 수 있게 `fill()` 가 `(bytes, missing_important: list[str])` 를 반환하거나 별도 함수 제공(라우트가 `X-Missing-Fields` 헤더로 쓴다).
  - pypdf `PdfWriter`: 템플릿 클론 → 모든 페이지에 `update_page_form_field_values(page, mapping, auto_regenerate=False)` → AcroForm 의 `/NeedAppearances` 를 `True` 로 설정 → `BytesIO` 로 write → bytes 반환.
  - 한글 렌더 검증: 테스트(아래)에서 한글 값이 깨지면(필드 폰트가 한글 미지원) `reportlab` 로 좌표 기반 오버레이를 그려 합성하는 fallback 을 구현하라(필드 `/Rect` 좌표 사용). **먼저 단순 경로(pypdf only)를 시도하고, 테스트가 한글 문제를 드러낼 때만 오버레이 구현.**

### 5. `app/main.py` 라우트
- `GET /health` → `{status:'ok', codex: codex_health()}`.
- `POST /extract` (`UploadFile`) → `extract_from_upload(await file.read(), file.filename)` → `ExtractResponse` (HTTP 200 항상; 단 세마포어 초과 시 429). 파일 누락/빈 → 400.
- `POST /fill-pdf` (`FillPdfRequest` JSON) → `fill()` → `Response(content=bytes, media_type='application/pdf', headers={'X-Missing-Fields': ','.join(missing)})`. `PdfTemplateMissing` → 500 `{error:{code:'PDF_TEMPLATE_MISSING',...}}`. 디스크/예기치 못한 → 500 구조화.

## Acceptance Criteria

```bash
cd ocr-service
python -m pip install -r requirements.txt
python -m pytest -q
# 테스트가 반드시 포함할 것:
#  - test_fill_pdf_all_fields: fill() 에 12개에 대응하는 샘플값 → 결과 PDF 를 pypdf 로 다시 열어
#       owner_name, vehicle_reg_no, vehicle_vin_1==vehicle_vin_2, "vehicle_year ", current_date 등 값이 들어갔는지 assert
#  - test_fill_pdf_field_names_match_template: PDF_FIELD_NAMES 가 템플릿 get_fields() 키와 일치
#  - test_parse_pure_json / test_parse_codefence / test_parse_prose_plus_json / test_parse_garbage(=failed)
#  - test_normalize: vin 정규화, "약 12,000 km" → 12000, 주소 개행→공백, year 4자리 추출
#  - test_extract_bad_image: 비이미지 bytes → status 'failed', error_code 'OCR_BAD_IMAGE', no crash
#  - test_extract_codex_mocked: run_codex_ocr 를 monkeypatch 해 ok/partial/예외 각각 → status·error_code 검증
#  - test_health: GET /health 가 codex 키 포함
cd ..
# (선택, 환경 의존) codex 가 설치+인증돼 있으면:
#  python -c "import asyncio; from app.extract import extract_from_upload; ..." 로 assets/samples 의 한 이미지를 넣어 status!='failed' 면 좋음.
#  codex 미설치/미인증이면 이 확인은 SKIP (블록 아님). 단 codex 가 이미지 입력을 아예 지원 안 하면 step 을 blocked 처리.
npm run build   # 루트 — backend/frontend 영향 없음 확인
```

## 검증 절차

1. 위 AC 실행.
2. 체크리스트: §2.6 의 codex 통합 규칙(방어 파싱 5단계, 정규화, 인증 부트스트랩, 타임아웃 90s)과 §2.8 의 OCR/PDF 엣지(미설치/미인증/한도/타임아웃/비JSON/부분JSON/VIN비정상/주소개행/필드명불일치/긴값/NeedAppearances/디스크부족/멀티페이지PDF→1페이지)가 코드에 반영됐는가? ocr-service 가 어떤 입력에도 크래시로 죽지 않는가(항상 구조화 응답)? 가짜 OCR(랜덤·하드코딩 값) 없는가?
3. `phases/0-mvp/index.json` step 2 업데이트: 성공 → `"completed"`, `"summary"` 에 `/extract`·`/fill-pdf`·`/health` 계약(요청/응답 shape, `error_code` 값들), `PDF_FIELD_NAMES` 매핑, codex 호출 명령 형태(확정된 플래그), 한글 렌더 fallback 사용 여부. codex 미설치/미인증이라 실제 OCR 검증을 못 했으면 그 사실도 summary 에 적되 step 은 completed(코드+모킹 테스트가 통과하면). codex 가 이미지 입력 미지원 → `blocked` + 사유.

## 금지사항

- 12개 PDF 폼필드명을 바꾸지 마라. 특히 `'vehicle_year '` 끝 공백. 이유: 채우기가 정확한 이름에 의존.
- codex 실패/예외를 라우트 밖으로 던져 서비스를 죽이지 마라 — 항상 `ExtractResponse`(또는 구조화 5xx). 이유: OCR 실패가 업무를 막으면 안 된다(§2.2).
- 가짜/하드코딩 OCR 결과를 반환하지 마라. 이유: 신뢰성.
- 클라우드 OCR API(Google Vision 등)를 끌어들이지 마라 — OCR 은 codex CLI 다(ADR-002). codex 가 정말 불가하면 blocked 후 사용자와 재논의.
- 기존 테스트/빌드를 깨뜨리지 마라.
