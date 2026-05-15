# Step 5: deploy

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` — §2.1(구성), §2.2(디렉토리), §2.8(배포/운영 엣지).
- `docs/ADR.md` — ADR-005(Render Blueprint), ADR-006(디스크 저장), ADR-008(codex 인증=auth.json 마운트), 철학.
- `docs/PRD.md` — §1.6(이식성·데이터 보존), §1.7(보안: 비밀값 env, SSN·auth.json 경고).
- `CLAUDE.md` — 1부 원칙.
- step0~4 산출물 / `phases/0-mvp/index.json` 의 step0~4 summary: 각 서비스 시작 명령, 포트, env 이름들(`DATABASE_URL`, `OCR_SERVICE_URL`, `CORS_ORIGIN`, `STORAGE_DIR`, `TEMPLATE_PATH`, `CODEX_AUTH_JSON`, 포트 변수), `assets/malso_application_template.pdf` 경로, ocr-service 가 codex CLI 를 호출한다는 사실.
- step0 이 만든 `Dockerfile.*`/`docker-compose.yml`/`render.yaml`/`README.md` 골격.

## 작업

배포 가능 상태로 마무리. 사용자가 서버 프로비저닝 없이 **Render Blueprint** 한 번으로 띄울 수 있게. 로컬은 `docker compose up` 한 줄.

1. **`Dockerfile.frontend`**: node 빌드 스테이지(`npm ci` → `npm -w frontend run build`) → 정적 서빙 스테이지(nginx 또는 `npx serve -s frontend/dist`). API 베이스를 빌드타임/런타임에 주입할 수 있게(예 `VITE_API_BASE` 또는 nginx 프록시). Render Static Site 로 갈 거면 Dockerfile 대신 build command + publish dir 도 가능 — 둘 중 단순한 쪽 선택하고 render.yaml 과 일관되게.
2. **`Dockerfile.backend`**: `node:20-slim` → `npm ci` → `npm -w backend run build` → `CMD ["node","backend/dist/index.js"]`. `STORAGE_DIR` 를 마운트 디스크 경로로(예 `/data/storage`). 부팅 시 migrate 는 backend 코드가 이미 함.
3. **`Dockerfile.ocr`**: `python:3.12-slim` 베이스 → Node 설치(`apt-get update && apt-get install -y --no-install-recommends nodejs npm` 또는 nodesource) → **`npm install -g <codex 패키지>`**(step0 이 ADR 에 적은 정확한 패키지명; 보통 `@openai/codex`) → `pip install -r ocr-service/requirements.txt` → 앱 복사 + `assets/` 복사 → `TEMPLATE_PATH=/app/assets/malso_application_template.pdf` → entrypoint 스크립트: `CODEX_AUTH_JSON` 있으면 `mkdir -p ~/.codex && printf '%s' "$CODEX_AUTH_JSON" > ~/.codex/auth.json && chmod 600 ...` 후 `exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`. (codex 설치가 실패하면 빌드가 실패하게 두고 — 명확히.)
4. **`render.yaml`** (Blueprint):
   - `services:`
     - `totaload-ocr` — `type: web`, `env: docker`, `dockerfilePath: ./Dockerfile.ocr`, `healthCheckPath: /health`, `envVars`: `PORT` (Render 제공), `TEMPLATE_PATH=/app/assets/malso_application_template.pdf`, `CODEX_AUTH_JSON` → `sync: false`(대시보드에서 수동 입력).
     - `totaload-backend` — `type: web`, `env: docker`, `dockerfilePath: ./Dockerfile.backend`, `healthCheckPath: /api/health`, `disk: { name: storage, mountPath: /data/storage, sizeGB: 1 }`, `envVars`: `DATABASE_URL` → `fromDatabase: { name: totaload-db, property: connectionString }`, `OCR_SERVICE_URL` → `fromService: { name: totaload-ocr, type: web, property: hostport }`(또는 `host`), `CORS_ORIGIN` → `fromService: { name: totaload-frontend, type: web, property: host }`(앞에 `https://`), `STORAGE_DIR=/data/storage`, `PORT`.
     - `totaload-frontend` — Static Site(`type: web`, `env: static`, `buildCommand: npm ci && npm -w frontend run build`, `staticPublishPath: ./frontend/dist`) **또는** docker. API 베이스를 backend host 로(빌드 env `VITE_API_BASE` ← `fromService: totaload-backend host`). routes/rewrite 로 SPA fallback(`/* → /index.html`).
   - `databases:` `- name: totaload-db` (Postgres, plan 은 free/starter).
5. **`docker-compose.yml`** (로컬 개발, 고정 포트):
   - `postgres:16` (env `POSTGRES_USER/PASSWORD/DB=totaload`, 포트 `5432:5432`, named volume).
   - `ocr` — build `Dockerfile.ocr`(또는 dev: python 이미지 + 볼륨 마운트 + `uvicorn --reload`), 포트 `8000:8000`, env `TEMPLATE_PATH`, `CODEX_AUTH_JSON`(호스트 env passthrough 또는 비워두고 호스트 `~/.codex` 를 read-only 마운트), `assets/` 마운트.
   - `backend` — build `Dockerfile.backend`(또는 dev), 포트 `4000:4000`, env `DATABASE_URL`(→postgres), `OCR_SERVICE_URL=http://ocr:8000`, `CORS_ORIGIN=http://localhost:5173`, `STORAGE_DIR`(볼륨), `depends_on: [postgres, ocr]`.
   - `frontend` — dev: node 이미지 + 볼륨 + `npm -w frontend run dev -- --host`, 포트 `5173:5173`, `VITE_API_BASE=http://localhost:4000`. (또는 build + serve.)
6. **`README.md`** 마무리:
   - 개요(Hanaru AI ERP, 말소 입력/검색).
   - 로컬 실행: `cp .env.example .env` → (codex 로컬 인증: `codex login` 으로 호스트 `~/.codex/auth.json` 생성 — OCR 쓰려면 필요, 없어도 앱은 동작하고 OCR 만 비활성) → `docker compose up --build` → `http://localhost:5173`.
   - 배포(Render): ① `git init && git add -A && git commit -m ...` 후 GitHub 에 푸시 → ② Render 대시보드 → New → **Blueprint** → 이 리포 선택(`render.yaml` 자동 인식) → Apply → ③ 배포 후 `totaload-ocr` 서비스의 `CODEX_AUTH_JSON` 환경변수에 **로컬 `~/.codex/auth.json` 파일 내용 전체**를 붙여넣고 재배포. (DATABASE_URL·OCR_SERVICE_URL·CORS_ORIGIN 은 Blueprint 가 자동 배선.)
   - 보안 경고: 주민등록번호가 평문 저장됨(로그인 없는 MVP) — 외부 노출 주의; `CODEX_AUTH_JSON` 은 ChatGPT 계정 자격증명이니 안전히 관리, 토큰 만료 시 `~/.codex` 재로그인 후 env 갱신.
   - 디스크 경고: backend 의 영구 디스크가 없으면 업로드 이미지·생성 PDF 가 재배포마다 사라짐 — render.yaml 의 `disk` 유지.
   - 운영 메모: DB/디스크 백업은 별도(MVP 범위 밖).

## Acceptance Criteria

```bash
python3 -c "import yaml; yaml.safe_load(open('render.yaml')); print('render.yaml parses')"
docker compose build                # 3개 이미지 빌드 성공 (codex 설치 포함)
docker compose up -d
sleep 10
curl -fsS http://localhost:4000/api/health   # {status:'ok', db:'ok', ocr: ...}
curl -fsS http://localhost:8000/health        # {status:'ok', codex: ...}
curl -fsS http://localhost:5173/ >/dev/null   # 프론트 로드
# 그리고 브라우저로 http://localhost:5173 → 말소 입력(샘플 등록증 업로드 → 폼 → PDF 생성) / 말소 검색 동선이 동작하는지 수동 확인
docker compose down
npm run build && npm run lint && npm run test
```

## 검증 절차

1. 위 AC 실행. (Docker 가 없는 환경이면 `docker compose build/up` 은 불가 — 그 경우 render.yaml/Dockerfile 정합성을 코드 리뷰로 확인하고 그 사실을 summary 에 명시. 가능하면 실제로 띄워 확인.)
2. 체크리스트: render.yaml 이 3 서비스 + Postgres + backend 디스크 + env 자동 배선(DATABASE_URL/OCR_SERVICE_URL/CORS_ORIGIN) + `CODEX_AUTH_JSON sync:false` 를 포함하는가? Dockerfile.ocr 가 codex CLI 를 설치하고 entrypoint 가 auth.json 을 기록하는가? 비밀값이 리포/yaml 에 하드코딩돼 있지 않은가? README 에 배포 절차·보안·디스크 경고가 있는가? CLAUDE.md 단순함?
3. `phases/0-mvp/index.json` step 5 업데이트: 성공 → `"completed"`, `"summary"` 에 Dockerfile 들·`render.yaml`·`docker-compose.yml`·`README.md` 의 핵심(서비스명, 포트, env 배선, codex 설치 패키지, 디스크 마운트 경로)과 로컬 `docker compose up` 동작 여부 한 줄 요약.

## 금지사항

- 비밀값(`CODEX_AUTH_JSON`, DB 비밀번호 등)을 `render.yaml`·Dockerfile·리포에 하드코딩하지 마라 — `sync: false` / env / `.env`(gitignore). 이유: §1.7.
- `Dockerfile.ocr` 에서 codex CLI 설치 단계를 빼지 마라 — 그게 OCR 의 전제다(ADR-002). 이유: 배포 시 OCR 동작.
- backend 의 영구 디스크(`disk:`)를 빼지 마라 — 업로드/생성 파일이 사라진다(ADR-006).
- 새 기능을 추가하지 마라(배포 설정만). 인증/로그인 추가 금지.
- 기존 테스트/빌드를 깨뜨리지 마라.
