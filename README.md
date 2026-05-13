# Totaload — 중고차 수출 ERP

자동차등록증 이미지 → 말소등록 신청서 PDF 자동 작성 + 차량/서류 검색.
설계 문서: [`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/ADR.md`](docs/ADR.md) · [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Richie-Kang/totaload-erp)

구성: `frontend/` (React+Vite+TS), `backend/` (Node+Express+TS), `ocr-service/` (Python+FastAPI), `assets/` (PDF 템플릿·샘플). 업로드 이미지와 생성된 PDF 는 Postgres `documents.file_bytes` 컬럼에 저장된다(ADR-011).

## 로컬 실행 (Docker)

```bash
cp .env.example .env
# (선택) OCR 을 쓰려면 호스트에서 먼저 codex 로그인 — ~/.codex/auth.json 생성:
codex login
docker compose up --build
# -> http://localhost:5173   (backend :4000, ocr-service :8000, postgres :5432)
```

`docker compose up` 이 postgres + ocr-service + backend + frontend 를 고정 포트로 띄운다. backend 는 부팅 시 DB 마이그레이션을 돌린 뒤 listen 한다. frontend(nginx)가 `/api` 를 backend 로 리버스 프록시하므로 브라우저는 `http://localhost:5173` 한 오리진만 본다. `codex login` 을 안 했어도 앱은 동작하고 OCR 만 비활성된다(`GET /api/health` 의 `ocr` 필드로 확인). 호스트에 `~/.codex` 가 없으면 compose 가 빈 디렉터리를 만든다 — OCR 만 비활성될 뿐 문제 없다.

헬스 체크:

```bash
curl -fsS http://localhost:4000/api/health   # {"status":"ok","db":"ok","ocr":"ok"}
curl -fsS http://localhost:8000/health        # {"status":"ok","codex":"ok|unauthenticated|missing"}
```

### Docker 없이 (워크스페이스 단위)

```bash
npm install
npm run build          # frontend + backend 컴파일
npm run lint
npm run test           # frontend/backend 테스트 + ocr-service pytest

npm run dev -w frontend     # http://localhost:5173 (개발 서버; /api 요청은 BACKEND_URL 또는 :4000 으로 프록시)
npm run dev -w backend      # http://localhost:4000  (postgres + .env 의 DATABASE_URL 필요)
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

## 배포 (Render Blueprint, 무료)

세 Render 서비스(frontend/backend/ocr)는 모두 free 플랜. Postgres 는 **외부 무료 호스트**(Supabase 또는 Neon)를 쓴다 — Render 의 free Postgres 가 30일 후 삭제되는 정책을 피하기 위해서다. 파일 바이트는 DB 컬럼(`documents.file_bytes`)에 보관하므로 영구 디스크가 필요 없다(ADR-011).

1. **Postgres 준비** — [Supabase](https://supabase.com) 또는 [Neon](https://neon.tech) 무료 프로젝트 생성 → **Connection String** 복사. 형태 예:
   - Supabase: `postgresql://postgres.xxxxx:<PWD>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require` (Transaction pooler, port **6543**)
   - Neon: `postgresql://<user>:<pwd>@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require`
   - 두 경우 모두 끝에 `?sslmode=require` 가 있어야 한다.
2. **GitHub 푸시** — 이 리포가 이미 GitHub 에 올라가 있어야 한다(README 상단의 1-click 버튼이 그것을 가리킨다).
3. **Blueprint 적용** — Render 대시보드 → **New** → **Blueprint** → 이 리포 선택 → `render.yaml` 자동 인식 → Apply. 생성되는 것: `totaload-frontend`(web, free, Docker — nginx 가 SPA 서빙 + `/api` → backend 프록시), `totaload-backend`(web, free, Docker), `totaload-ocr`(web, free, Docker — codex CLI 포함). DB 서비스는 만들지 않는다.
4. **환경변수 설정** — `sync: false` 인 두 값을 대시보드에서 입력:
   - `totaload-backend` → `DATABASE_URL` = (1) 의 Connection String
   - `totaload-ocr` → `CODEX_AUTH_JSON` = 로컬 `~/.codex/auth.json` 의 **내용 전체**(`pbcopy < ~/.codex/auth.json` 으로 복사 후 붙여넣기)
   - 둘 다 입력하면 두 서비스가 자동 재배포된다.
5. **헬스 체크**:
   ```bash
   curl -fsS https://totaload-backend.onrender.com/api/health
   # -> {"status":"ok","db":"ok","ocr":"ok"}
   ```
   서비스명에 충돌로 접미사가 붙었으면 대시보드의 실제 URL 을 쓰고, `OCR_SERVICE_URL` / `CORS_ORIGIN` / `BACKEND_URL` 도 함께 고쳐라.

`CODEX_AUTH_JSON` 을 안 넣어도 앱은 동작한다 — OCR 만 비활성되고 폼은 수동 입력으로 쓸 수 있다.

## 보안

- **주민등록번호(SSN)는 평문 저장**(MVP, 로그인 없음) — 목록/검색에 미노출, 상세 화면에서 마스킹 + 눈 아이콘 토글. 외부 노출에 주의하라; 향후 컬럼 암호화·접근제어가 필요하다.
- `CODEX_AUTH_JSON` 은 ChatGPT 계정 자격증명이다 — 안전하게 관리하고 리포/`render.yaml`/Dockerfile 에 절대 커밋하지 마라(`sync: false` / env / `.env`). `DATABASE_URL` 도 env(Render `fromDatabase`)로만 주입된다.
- codex 토큰 만료 시: 로컬에서 `codex login` 으로 `~/.codex/auth.json` 을 갱신 → 그 내용을 `totaload-ocr` 의 `CODEX_AUTH_JSON` 에 다시 설정 → 재배포.
- `DATABASE_URL` 도 `sync: false` 라 리포에 안 들어간다(Supabase/Neon 대시보드에서 비밀번호 노출 주의).

## 한계 (Known limitations)

MVP 범위에서 의도적으로 두지 않은 것 / 알려진 제약 (자세한 배경은 `docs/ADR.md`):

- **로그인·권한 없음** — 누구나 접근 가능(ADR-004). 주민등록번호는 평문 저장(목록/검색 미노출, 상세에서 마스킹+토글). 사내·소규모 사용 전제. 향후 인증·컬럼 암호화 필요.
- **OCR 정확도 보장 안 함** — codex(LLM 비전) 출력은 비결정적이고 환각 가능. 사람의 검수가 최종 책임이며, 시스템은 OCR 실패로 업무를 막지 않는다(항상 수동 입력 폴백).
- **입력 PDF 는 첫 페이지만 OCR** — 멀티페이지 스캔이면 1페이지만 인식(ADR-010). 등록증 앞면이 1페이지라 실무상 수용.
- **첨부 이미지가 여러 장이어도 OCR 은 첫 장만** — 나머지는 보기·참고용. 재인식은 "다시 분석"으로 명시적으로.
- **OCR 동기 처리** — 업로드 요청이 codex 완료까지 대기(타임아웃 90초). 잡 큐 비동기화는 향후 과제(ADR-009).
- **동시 편집 충돌 감지 없음** — 같은 차량을 둘이 동시에 고치면 last-write-wins(ADR-004 규모 수용).
- **파일 저장 = Postgres `bytea`** — S3 아님(ADR-011). DB 용량 한도가 곧 저장 한도(Supabase free 500MB ≈ 차량 200~250건). 한도 근접 시 R2/S3 로 옮기는 것이 다음 과제.
- **재고관리·매입매출·정산·수출신고·통계·알림·다국어 없음** — `docs/PRD.md §8` 참조.
- **모바일 전용 UI 아님** — 데스크톱 2열 우선, 좁은 화면은 best-effort(깨지지만 않게).
- **`DELETE /api/malso/:id` 미구현** — 잘못 만든 레코드 정리 수단 없음(PRD §10).

## 운영 메모

- **DB 용량**: 파일 바이트가 DB 에 들어가므로 Supabase/Neon 대시보드의 사용량을 가끔 본다. Supabase free 500MB / Neon free 0.5~3GB. 한도 근접 시 R2/S3 로 마이그레이션(향후 과제, ADR-011 부록).
- **DB 백업**: Supabase/Neon 의 자동 백업 정책을 확인하라(무료 티어는 한정적). 중요 데이터는 별도 `pg_dump` 운영(MVP 범위 밖).
- **콜드 스타트**: free 플랜 web 서비스는 ~15분 idle 후 슬립 → 첫 요청이 30~60초 걸린다. ocr 가 슬립이면 `/api/health` 의 `ocr` 가 잠시 `down`, 첫 업로드가 실패할 수 있다(재시도). 항상 깨어 있게 하려면 UptimeRobot 등으로 5분마다 헬스 핑을 걸거나 backend 만 starter($7/mo) 로 올린다.
