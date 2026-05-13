# Totaload — 중고차 수출 ERP

자동차등록증 이미지 → 말소등록 신청서 PDF 자동 작성 + 차량/서류 검색.
설계 문서: [`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/ADR.md`](docs/ADR.md) · [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md).

구성: `frontend/` (React+Vite+TS), `backend/` (Node+Express+TS), `ocr-service/` (Python+FastAPI), `assets/` (PDF 템플릿·샘플), `storage/` (런타임 업로드/생성물, gitignore).

## 로컬 실행

> TODO(step5): `docker compose up` 한 줄로 postgres + backend + ocr-service + frontend 기동.

현재(scaffold 단계) 워크스페이스 단위 실행:

```bash
npm install
npm run build          # frontend + backend 컴파일
npm run lint
npm run test           # frontend/backend 테스트 + ocr-service pytest

npm run dev -w frontend     # http://localhost:5173
npm run dev -w backend      # http://localhost:4000  (GET /api/health)
cd ocr-service && python3 -m pip install -r requirements.txt && python3 -m uvicorn app.main:app --reload   # http://localhost:8000/health
```

환경변수는 `.env.example` 참고(`cp .env.example .env`).

## 배포

> TODO(step5): Render Blueprint(`render.yaml`).
> 1. `git init` + GitHub 푸시
> 2. Render 에서 `render.yaml` Blueprint 로 frontend(static) / backend(web + 영구 disk) / ocr-service(web, Docker) / managed PostgreSQL 생성
> 3. ocr-service 의 `CODEX_AUTH_JSON` 등 env 설정 (로컬 `~/.codex/auth.json` 내용)

## 보안

> TODO(step5/6 에서 보강):
> - **주민등록번호(SSN)는 평문 저장**(MVP, 로그인 없음) — 목록/검색 미노출, 상세에서 마스킹+토글. 향후 컬럼 암호화·접근제어 필요.
> - `CODEX_AUTH_JSON`(ChatGPT 인증), `DATABASE_URL` 은 env 로만. 리포에 커밋 금지.
> - codex 토큰 만료 시 갱신: 로컬 `codex login` 후 `~/.codex/auth.json` 내용을 다시 `CODEX_AUTH_JSON` 에 설정.
> - 영구 디스크 미마운트 시 `storage/` 가 재배포마다 사라짐 — Render disk 설정 필수.
> - DB 백업은 운영 과제(MVP 범위 밖).
