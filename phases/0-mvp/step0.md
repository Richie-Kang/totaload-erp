# Step 0: project-setup

## 읽어야 할 파일

먼저 아래를 읽고 프로젝트의 기획·아키텍처·설계 의도를 파악하라:

- `/Users/rich/.claude/plans/ethereal-wondering-puzzle.md` — **이 phase 전체의 마스터 계획서.** 이 step 의 작업은 이 계획서의 0·1·2·3·4절을 `docs/` 로 옮기는 것을 포함한다. 반드시 정독하라.
- `CLAUDE.md` (리포 루트) — 1부(행동 원칙), 2부(harness 절차).
- `.claude/commands/harness.md` — step 파일 규약.
- `PDF_폼필드 추가_[별지 제17호서식] 자동차 말소등록 신청서(자동차등록규칙) (1).pdf` — 채워야 할 폼 템플릿(2페이지, AcroForm 텍스트 필드 12개).
- `20251203_자동차등록증.jpg`, `자동차등록증_레이.jpg` — 샘플 자동차등록증.
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md` — 현재는 빈 템플릿. 이 step 에서 채운다.

## 배경 (이 phase 가 만드는 것)

중고차 수출 회사 트리닉의 사내 ERP "Hanaru AI ERP" MVP. 핵심 기능 2개: **말소 입력**(자동차등록증 이미지 업로드 → OCR 로 정보 추출 → 말소등록 신청서 PDF 의 폼필드 12개 채움 → 사용자가 검수·수정 → PDF 생성/인쇄), **말소 검색**(차량번호/차대번호 일부로 차량·서류 검색). 사이드바 2항목. 로그인 없음. 스택: React(frontend) / Node.js(backend) / Python(ocr-service) / PostgreSQL. OCR 은 ocr-service 가 로컬 `codex` CLI 를 호출해 수행. 배포는 Render Blueprint. 진행은 harness(이 phase, step0~6).

## 작업

이 step 은 monorepo 스캐폴드 + 문서 작성 + 자산 정리 + 배포 골격. **코드 로직은 거의 없다**(빈 앱 + 설정).

1. **npm workspaces monorepo 스캐폴드** (루트 `package.json` 에 `"workspaces": ["frontend", "backend"]`):
   - `frontend/` — Vite + React + TypeScript + Tailwind CSS 새 앱. eslint 설정. 스크립트: `dev`, `build`(`tsc && vite build`), `lint`(eslint), `test`(vitest, 일단 통과하는 더미 1개라도).
   - `backend/` — Node + Express + TypeScript. `tsx`(또는 ts-node) 로 dev, `tsc` 로 build(→`dist/`). eslint. vitest + supertest. 스크립트: `dev`, `build`, `lint`, `test`, `migrate`(step1 에서 채움 — 일단 빈 스텁). `src/index.ts` 는 일단 `app.listen` 만 하는 최소 Express 앱 + `GET /api/health` → `{status:'ok'}`.
   - `ocr-service/` — Python FastAPI. `requirements.txt`: `fastapi`, `uvicorn[standard]`, `pypdf`, `python-multipart`, `pillow`, `pydantic`, `pypdfium2`, `httpx`, `pytest`, `reportlab`. `app/main.py` 에 최소 FastAPI 앱 + `GET /health` → `{status:'ok'}`. `app/__init__.py`. `tests/test_smoke.py` 1개(앱 import 되는지).
   - 루트 `package.json` 스크립트: `"lint": "npm -ws run lint"`, `"build": "npm -ws run build"`, `"test": "npm -ws run test && (cd ocr-service && python -m pytest -q)"`. (Stop 훅이 `npm run lint && npm run build && npm run test` 를 돌린다 — 전부 통과해야 한다.)
2. **`.gitignore`** 에 추가(기존 줄 유지): `node_modules/`, `dist/`, `frontend/dist/`, `backend/dist/`, `.env`, `.env.*`, `!.env.example`, `storage/`, `ocr-service/.venv/`, `__pycache__/`, `*.pyc`, `.DS_Store`.
3. **`.env.example`** 작성(값은 더미/주석): `DATABASE_URL=postgresql://totaload:totaload@localhost:5432/totaload`, `BACKEND_PORT=4000`, `OCR_SERVICE_URL=http://localhost:8000`, `OCR_PORT=8000`, `CORS_ORIGIN=http://localhost:5173`, `STORAGE_DIR=./storage`, `TEMPLATE_PATH=./assets/malso_application_template.pdf`, `CODEX_AUTH_JSON=` (주석: 로컬은 비워두고 호스트 ~/.codex 사용; 배포 시 ~/.codex/auth.json 내용을 넣는다).
4. **`assets/` 정리** — 리포 루트의 기존 파일을 **복사**(원본 삭제 금지):
   - `PDF_폼필드 추가_[별지 제17호서식] 자동차 말소등록 신청서(자동차등록규칙) (1).pdf` → `assets/malso_application_template.pdf` (ASCII 경로로 rename — 이후 모든 코드가 이 경로를 쓴다).
   - `20251203_자동차등록증.jpg`, `자동차등록증_레이.jpg` → `assets/samples/`.
   - 확인: `python3 -c "from pypdf import PdfReader; print(sorted(PdfReader('assets/malso_application_template.pdf').get_fields().keys()))"` 결과가 정확히 이 12개여야 한다(공백 포함 그대로): `['current_date', 'owner_address', 'owner_name', 'owner_ssn', 'vehicle_mileage', 'vehicle_model', 'vehicle_reg_no', 'vehicle_vin_1', 'vehicle_vin_2', 'vehicle_weight_1', 'vehicle_weight_2', 'vehicle_year ']` — 마지막 항목 `'vehicle_year '` 의 **끝 공백**을 절대 바꾸지 마라.
5. **문서 작성** — `/Users/rich/.claude/plans/ethereal-wondering-puzzle.md` 의 각 절을 다음 파일로 옮겨 채운다(템플릿 자리표시자 제거, 내용은 계획서 그대로 또는 충실히 풀어서):
   - 계획서 1절 → `docs/PRD.md`
   - 계획서 2절(2.1~2.8 전부) → `docs/ARCHITECTURE.md`
   - 계획서 3절(ADR-001~010 + 철학) → `docs/ADR.md`
   - 계획서 4절(4.1~4.7 UX/UI 전부) → `docs/UI_GUIDE.md`
   이 4개 문서는 이후 step 들의 가드레일로 매 프롬프트에 주입되니, **빠짐없이** 옮겨라.
6. **`codex` CLI 확인** — `codex --version`, `codex exec --help`(또는 `codex --help`) 를 실행해 (a) 설치 여부, (b) 이미지 입력 플래그(예 `-i`/`--image`), (c) 비대화/비승인 실행 플래그(예 `--ask-for-approval never`, `--sandbox read-only`, `--skip-git-repo-check`), (d) 출력 형식 옵션을 확인하고 결과를 `docs/ADR.md` 의 ADR-002 아래 "확인된 codex CLI 인터페이스" 메모로 기록하라. codex 가 설치돼 있지 않으면 그 사실만 기록하고 이 step 은 계속 진행한다(블록하지 않음 — step2 에서 다룬다). **이미지 입력을 어떤 방식으로도 지원하지 않는 것으로 확인되면**, 이 step 을 `error` 가 아니라 그대로 두고 그 사실을 ADR 에 크게 기록한 뒤 진행하라(step2 가 대안을 다룬다).
7. **배포 골격(내용은 step5 에서 채움, 여기선 빈/최소 파일만 생성하고 주석으로 TODO):** `Dockerfile.frontend`, `Dockerfile.backend`, `Dockerfile.ocr`, `docker-compose.yml`, `render.yaml`. `README.md` 골격(제목, "로컬 실행", "배포", "보안" 섹션 헤더 + TODO).
8. `storage/` 디렉토리 + `storage/.gitkeep`(혹은 런타임 생성에 맡기되 `.gitignore` 됨). `assets/.gitkeep` 불필요(파일 있음).

## Acceptance Criteria

```bash
npm install
npm run build                      # frontend + backend 컴파일 에러 없음
npm run lint                       # 통과
npm run test                       # frontend/backend 더미 테스트 + pytest 통과
cd ocr-service && python -m pip install -r requirements.txt && python -c "import fastapi, pypdf, PIL, pypdfium2, reportlab" && cd ..
python3 -c "from pypdf import PdfReader; ks=sorted(PdfReader('assets/malso_application_template.pdf').get_fields().keys()); assert ks==['current_date','owner_address','owner_name','owner_ssn','vehicle_mileage','vehicle_model','vehicle_reg_no','vehicle_vin_1','vehicle_vin_2','vehicle_weight_1','vehicle_weight_2','vehicle_year '], ks; print('OK', ks)"
test -s docs/PRD.md && test -s docs/ARCHITECTURE.md && test -s docs/ADR.md && test -s docs/UI_GUIDE.md
grep -q '자리표시자\|{기능 1}\|{이 프로젝트' docs/PRD.md && { echo 'PRD 가 아직 템플릿 상태'; exit 1; } || echo 'docs OK'
```

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트: ARCHITECTURE.md 의 디렉토리 구조(frontend/backend/ocr-service/assets/docs/storage + Dockerfile.* + docker-compose.yml + render.yaml + 루트 package.json)와 실제 트리가 일치하는가? ADR 의 기술 스택을 벗어나지 않았는가? CLAUDE.md 원칙(단순함·외과적 변경) 위반 없는가(빈 앱이라 코드 최소여야 함)?
3. `phases/0-mvp/index.json` 의 step 0 을 업데이트: 성공 → `"status":"completed"`, `"summary"` 에 생성된 디렉토리/주요 파일 경로(특히 `assets/malso_application_template.pdf`, docs 4개, 루트 package.json 스크립트, frontend/backend/ocr-service 위치)와 codex CLI 확인 결과(설치/플래그) 한 줄 요약.

## 금지사항

- 12개 폼필드 이름을 바꾸지 마라. 특히 `'vehicle_year '` 의 끝 공백을 제거하지 마라. 이유: PDF 채우기는 정확한 필드명에 의존한다.
- 리포 루트의 기존 파일(원본 PDF, 샘플 jpg)을 삭제하거나 이동하지 마라. 복사만 해라. 이유: 외과적 변경 원칙, 사용자가 IDE 에서 보고 있을 수 있음.
- 비즈니스 로직(OCR, PDF 채우기, DB, 라우트)을 여기서 구현하지 마라. 이후 step 의 몫이다. 이유: step scope 최소화.
- 인증/로그인/권한을 만들지 마라(MVP 제외). 추가 라이브러리를 투기적으로 넣지 마라.
- 기존 테스트를 깨뜨리지 마라.
