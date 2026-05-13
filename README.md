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

npm run dev -w frontend     # http://localhost:5173 (개발 서버; /api 요청은 BACKEND_URL 또는 :4000 으로 프록시)
npm run dev -w backend      # http://localhost:4000  (GET /api/health)
cd ocr-service && python3 -m pip install -r requirements.txt && python3 -m uvicorn app.main:app --reload   # http://localhost:8000/health
```

환경변수는 `.env.example` 참고(`cp .env.example .env`).

## 수동 UX 체크리스트 (frontend)

backend(+postgres) 와 ocr-service(또는 모킹) 가 떠 있는 상태에서 `npm run dev -w frontend` 후 http://localhost:5173 :

1. `/malso/new` 에서 샘플 등록증 드롭 → 즉시 2열·빈 폼·"분석 중" 배너; 그 사이 '주행거리(km)'에 값 입력 → 응답 도착 시 '주행거리'는 사용자 값 유지, 나머지 빈 칸만 OCR 값으로 채워짐; URL 이 `/malso/:id` 로 바뀜.
2. 그 페이지 새로고침 → `/malso/:id` 로 복구, 입력값 보존; `/malso/new` 의 "작성 중" 목록에도 그 차량이 보임.
3. 좌측 이미지 확대/이동/90° 회전 동작.
4. 필드 수정 → "저장됨 HH:MM" 표시; 백엔드를 잠깐 죽이면 저장 실패 경고 + 라우트 이탈(탭 닫기) 시 confirm.
5. "말소등록 신청서 PDF 만들기" → 미리보기 모달 → 다운로드/인쇄; 중요한 필드 비우고 시도 → confirm 후 빈 채로 생성 + 누락 안내 토스트.
6. `/malso/search` 에서 차량번호/차대번호 일부 입력 → 디바운스 검색, 매칭 하이라이트; 검색어 비우면 "최근 차량"; 없는 값 → 0건 메시지; 결과/목록에 주민번호 안 보임; 행 클릭 → 상세.
7. 상세에서 주민등록번호 칸 마스킹 + 눈 아이콘 토글.
8. 키보드(Tab/Enter/Esc)만으로 업로드→입력→PDF 생성까지 가능.

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
