# Step 0: ocr-service-providers

## 읽어야 할 파일
- `ocr-service/app/{main.py,extract.py,codex_client.py,schema.py,fill_pdf.py}` 전부.
- `docs/ADR.md` ADR-002(OCR=codex CLI), ADR-008(codex 인증).
- `CLAUDE.md` 1부.

## 작업
Codex 단일 OCR → **3개 provider 선택형**.

1. **`ocr-service/app/providers/` 디렉토리** 생성 + 모듈 분리:
   - `providers/__init__.py` — `run_ocr(provider: str, image_path: str, image_bytes: bytes) -> str` dispatcher. 공통 예외 `ProviderError(Unavailable/Auth/RateLimit/Timeout/BadOutput)` 노출. 알 수 없는 provider → `ValueError`.
   - `providers/codex.py` — 기존 `codex_client.py` 의 `run_codex_ocr`/`codex_health` 그대로 이동. import path 갱신.
   - `providers/upstage.py` — Upstage Document Parse (`POST https://api.upstage.ai/v1/document-digitization`, model=`document-parse`) 로 텍스트 추출 → Solar Chat (`POST https://api.upstage.ai/v1/chat/completions`, model=`solar-pro` 또는 환경변수 `UPSTAGE_MODEL`) 에 추출 텍스트 + 동일 추출 prompt 전달 → JSON 문자열 반환. 인증 = `Authorization: Bearer ${UPSTAGE_API_KEY}`. 401 → `ProviderAuth`. 429/리밋 → `ProviderRateLimit`. 타임아웃 60s → `ProviderTimeout`. 키 미설정 → `ProviderUnavailable`. JSON 파싱은 caller (extract.py) 책임 — 그냥 raw text 반환.
   - `providers/gemini.py` — Gemini 1.5 Flash (`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`) 멀티모달 호출 (image base64 inline_data + 동일 prompt). `generationConfig.response_mime_type = "application/json"`. 응답에서 `candidates[0].content.parts[0].text` 가 JSON 문자열. 같은 에러 매핑. 키 미설정 → `ProviderUnavailable`.

2. **`extract.py`**:
   - `extract_from_upload(data, filename, provider="upstage")` — provider 인자 추가. provider 가 비어있거나 None 이면 "upstage" 기본.
   - `codex_client` import → `providers` import 로 갈음.
   - 에러 매핑: provider 별 5개 예외 → 기존 `OCR_*` 코드. `OCR_UNAVAILABLE/_AUTH/_RATE_LIMIT/_TIMEOUT/_BAD_OUTPUT`.
   - `ExtractResponse` 에 `provider: str` 필드 추가 (선택). 응답 raw 에는 provider 라벨 포함.

3. **`schema.py`**:
   - `ExtractResponse` 에 `provider: Optional[str] = None` 추가. `ExtractedFields` 변경 없음.

4. **`main.py`**:
   - `POST /extract` 가 `provider: Optional[str] = Form(default=None)` 추가. `extract_from_upload(data, filename, provider)` 호출.
   - `GET /health` 가 provider 별 readiness 반환: `{ "status": "ok", "codex": "ok|unauthenticated|missing", "upstage": "configured|missing", "gemini": "configured|missing" }`. (실제 API 호출 안 함 — env 키만 본다.)
   - 부팅 시 `CODEX_AUTH_JSON` 기존 로직 유지.

5. **`codex_client.py` 삭제** — `providers/codex.py` 로 이동했으므로. (단, `main.py` 의 import 만 옮기면 됨.)

6. **테스트** `ocr-service/tests/`:
   - 기존 `test_ocr.py` 의 codex 모킹은 새 경로(`providers.codex.run_codex_ocr`)로 갱신.
   - Upstage 테스트: `httpx` 응답을 monkeypatch 로 모킹하여 (a) 200 with Solar JSON content, (b) 401, (c) 429, (d) 키 없음 → ProviderUnavailable.
   - Gemini 테스트: 마찬가지.

## Acceptance Criteria
```bash
cd ocr-service && python -m pytest -q   # 모두 통과 (3 provider × 핵심 케이스)
python -c "from app.providers import run_ocr"   # import OK
```

## 검증 절차
1. 위 AC.
2. provider 별로: 키 없으면 `OCR_UNAVAILABLE`; 호출 실패 시 각 코드 매핑 정확; 성공 시 JSON 문자열 반환되어 `extract.py` 가 정상 파싱.
3. `phases/1-multi-ocr/index.json` step 0 → "completed", summary 에 새 모듈 경로·env 변수 이름·예외 매핑 한 줄.

## 금지사항
- API 키를 코드/테스트에 하드코딩하지 마라 — 모든 키는 env 로만.
- `httpx` 호출에 타임아웃 빼지 마라(60s 이하).
- Codex 흐름을 망가뜨리지 마라 — 기존 codex provider 도 동일하게 동작.
- 기존 폼필드 매핑(`vehicle_year ` 끝 공백 포함)·`/fill-pdf` 동작 변경 금지.
