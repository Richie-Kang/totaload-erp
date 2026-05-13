# Totaload — Used-Car Export ERP

A working MVP for **TRYNIC**, a Korean used-car exporter. Drop a photo of a Korean vehicle
registration certificate (자동차등록증) and the app fills the **mandatory deregistration form
(말소등록 신청서)** automatically — then prints, stores, and lets you search past records.

---

## 🟢 Try it now (no install)

### **→ [https://totaload-frontend.onrender.com](https://totaload-frontend.onrender.com)**

It's a single web app — no signup. The first request after idle takes ~30–60s (free-tier cold
start), every request after that is fast.

**30-second walkthrough**

1. Open the link above. Wait for the sidebar to render.
2. Click **"말소 입력"** (Deregistration input) in the left sidebar.
3. Drop one of these sample registration certificates onto the dropzone, or your own JPG/PNG/PDF:
   - [assets/samples/자동차등록증_레이.jpg](assets/samples/자동차등록증_레이.jpg)
   - [assets/samples/20251203_자동차등록증.jpg](assets/samples/20251203_자동차등록증.jpg)
4. Watch the form auto-fill from OCR. **Switch the OCR engine in the top-right (Upstage · Codex · Gemini)** and re-drop the same file to compare speed and field accuracy.
5. Click **"말소등록 신청서 PDF 만들기"** → preview → download the filled official form.
6. Open **"말소 검색"** in the sidebar to find the vehicle by plate or VIN, or delete the test record.

[![Deploy your own to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Richie-Kang/totaload-erp)

---

## What this is

The official 말소등록 application is a 12-field government PDF (별지 제17호서식). Today the
operator transcribes those 12 fields by hand from a paper registration certificate — slow and
error-prone. This MVP:

1. Accepts the registration certificate as image or PDF.
2. Runs OCR + structured extraction (Upstage / Codex / Gemini, selectable).
3. Fills the 12 PDF form fields, including the trailing-space `vehicle_year ` field and the
   duplicate VIN on page 2 + the right-middle weight box.
4. Lets the operator review/edit before printing (the human, not the model, is the source of truth).
5. Stores the original cert + the generated PDF on the vehicle record, and exposes a fast partial-match
   search over plate / VIN.

Target: **< 1 minute per vehicle, end-to-end.**

## Why Upstage is the primary OCR

Upstage is the default OCR engine, listed first in the picker, because of three concrete fits
for this workload:

1. **Korean-document quality.** A real registration certificate has a dense Korean layout —
   numeric labels (`주행거리`, `차량총중량`), mixed Hangul + ASCII (plate `123가4567`, VIN `KL3AB12CD34567890`),
   and frequent rotation / shadow on phone snapshots. Upstage Document Parse is trained for
   exactly this regime; it returns layout-aware text rather than a flat blob.
2. **2-step pipeline that we can reason about.** The Upstage provider here is `Document Parse →
   Solar Chat`. Step 1 extracts the text and layout; step 2 asks Solar to coerce that text into
   our fixed 9-field JSON schema. Each step is observable on its own — if the structured output
   is wrong, we can inspect the raw OCR text and tell whether OCR or the LLM is at fault.
3. **Lower latency than a CLI vision call.** Codex (`codex exec -i image`) routes through a CLI
   process and an LLM-style reasoning pass; the per-image cost is dominated by the model's
   thinking budget. Upstage's document endpoint is a normal HTTP API — measurably faster on
   typical certificate images.

The Gemini and Codex providers are kept because they're useful baselines for a Part 2
comparison: Gemini for "what does a frontier multimodal model do in one shot?" and Codex
for "what does an LLM-vision CLI do with no provider-specific tuning?".

## Architecture

```
   Browser (React + Vite SPA)
        │  /api/*  (same-origin, nginx reverse-proxy)
        ▼
   Backend (Express + TS)  ──► Postgres (Supabase free)
        │                       └─ vehicles + documents.file_bytes (bytea)
        │
        ▼  POST /extract  (provider=upstage|codex|gemini)
   OCR service (FastAPI)
        ├─ providers/upstage.py   → POST document-digitization → POST chat/completions
        ├─ providers/codex.py     → subprocess codex exec -i …
        └─ providers/gemini.py    → POST generativelanguage… generateContent
        │
        └─ POST /fill-pdf  →  pypdf fills the 12-field AcroForm template
```

The provider abstraction is a thin contract in
[`ocr-service/app/providers/__init__.py`](ocr-service/app/providers/__init__.py): every provider
exposes `run_ocr(image_path, image_bytes) -> str` and surfaces a typed `ProviderError`
(`Unavailable / Auth / RateLimit / Timeout / BadOutput`). Adding a fourth provider is a single
file plus one line in the dispatcher.

**Why no S3 / object storage?** Free-tier deploy. Document bytes live in
`documents.file_bytes bytea`. The trade-off and the migration path are spelled out in
[ADR-011](docs/ADR.md#adr-011).

## Comparing OCR providers

Same image, three engines, one normalized output. To run a comparison live:

1. Open [https://totaload-frontend.onrender.com](https://totaload-frontend.onrender.com).
2. Drop the same sample certificate three times, toggling the engine in the top-right between
   `Upstage` → `Codex` → `Gemini`. Each upload creates an independent vehicle record (the
   provider used is stored in the `raw_ocr.provider` field for that vehicle).
3. Compare wall-clock time (visible in the banner), the per-field accuracy, and how each engine
   handles a stress sample (low-light, rotated, redacted SSN, etc.).

For an offline comparison, the same 3 providers can be exercised in tests — see
`ocr-service/tests/test_ocr.py` (mocked httpx calls).

## Stack & decisions

- **Language**: TypeScript everywhere on the JS side (strict). Python for OCR / PDF.
- **Frontend**: React 18 + Vite 6 + Tailwind + react-router 7 + @tanstack/react-query 5.
- **Backend**: Express + `pg` (no ORM — schema is small, SQL is honest).
- **OCR service**: FastAPI + httpx + pypdf + pypdfium2. Per-provider clients are isolated
  modules.
- **DB**: PostgreSQL 16. Migrations are idempotent SQL run on boot (`backend/src/db/schema.sql`).
- **Deploy**: Render Blueprint, all services on the free plan; database is external (Supabase or
  Neon free).
- **Tests**: 24 pytest tests in `ocr-service` (providers + parsing + fill-pdf), 14 supertest tests
  in `backend` (real Postgres), 11 vitest tests in `frontend`. All run on every push.

The architectural reasoning for each non-obvious choice lives in [`docs/ADR.md`](docs/ADR.md) —
ADR-002 (OCR via local LLM), ADR-005 (Render Blueprint), ADR-011 (bytea storage),
ADR-012 (multi-provider OCR — Upstage primary), etc.

## Repo layout

```
frontend/        React SPA
backend/         Express API (multipart upload → OCR call → DB → fill-pdf)
ocr-service/     FastAPI + providers/{upstage,codex,gemini}.py + fill_pdf.py
assets/          Official PDF template + sample registration certs
docs/            PRD · ARCHITECTURE · ADR · UI_GUIDE
phases/          The harness phases this repo was built through (0-mvp, 1-multi-ocr)
render.yaml      Free-plan Blueprint (frontend / backend / ocr-service)
```

---

## 로컬 실행 / Local development

```bash
cp .env.example .env
# Optional — set UPSTAGE_API_KEY (primary), GEMINI_API_KEY, CODEX_AUTH_JSON in .env
docker compose up --build
# -> http://localhost:5173   (backend :4000, ocr-service :8000, postgres :5432)
```

`docker compose up` 이 postgres + ocr-service + backend + frontend 를 고정 포트로 띄운다.
Backend 는 부팅 시 DB 마이그레이션을 돌린 뒤 listen 하고, frontend(nginx)가 `/api` 를 backend
로 리버스 프록시하므로 브라우저는 `http://localhost:5173` 한 오리진만 본다. 어떤 OCR API 키도
설정 안 했어도 앱은 동작한다 — 폼은 수동 입력으로 쓸 수 있고 `/api/health` 가 각 provider 의
readiness 를 보여준다.

Health checks:

```bash
curl -fsS http://localhost:4000/api/health    # {"status":"ok","db":"ok","ocr":"ok"}
curl -fsS http://localhost:8000/health         # per-provider readiness (upstage/codex/gemini)
```

### Without Docker (workspaces)

```bash
npm install
npm run build          # frontend + backend
npm run lint
npm run test           # frontend vitest + backend vitest + ocr-service pytest

npm run dev -w frontend     # http://localhost:5173 (proxy /api -> BACKEND_URL or :4000)
npm run dev -w backend      # http://localhost:4000  (needs DATABASE_URL)
cd ocr-service && python3 -m pip install -r requirements.txt && \
  python3 -m uvicorn app.main:app --reload    # http://localhost:8000/health
```

## 배포 / Deployment (Render Blueprint, free)

All three services are free plan. Postgres is external (Render free Postgres expires after 30
days). File bytes live in `documents.file_bytes` so no persistent disk is needed (ADR-011).

1. **External Postgres** — create a project on [Supabase](https://supabase.com) or
   [Neon](https://neon.tech) and copy the Transaction-pooler connection string.
   - Supabase: `postgresql://postgres.<ref>:<PWD>@aws-…pooler.supabase.com:6543/postgres?sslmode=require`
   - Neon: `postgresql://<user>:<pwd>@ep-…neon.tech/neondb?sslmode=require`
2. **Push to GitHub** (this repo already lives at
   [github.com/Richie-Kang/totaload-erp](https://github.com/Richie-Kang/totaload-erp)).
3. **Apply Blueprint** — Render → New → Blueprint → pick this repo → `render.yaml` auto-detected
   → Apply. Creates `totaload-frontend`, `totaload-backend`, `totaload-ocr` on free plan.
4. **Fill the four `sync: false` env vars** in the dashboard:
   - `totaload-backend` → `DATABASE_URL` = the connection string from (1).
   - `totaload-ocr` → `UPSTAGE_API_KEY` = from https://console.upstage.ai (primary).
   - `totaload-ocr` → `GEMINI_API_KEY` = from https://aistudio.google.com/apikey (secondary).
   - `totaload-ocr` → `CODEX_AUTH_JSON` = contents of your local `~/.codex/auth.json`
     (`pbcopy < ~/.codex/auth.json`).
5. **Health check**:
   ```bash
   curl -fsS https://totaload-backend.onrender.com/api/health
   # -> {"status":"ok","db":"ok","ocr":"ok"}
   curl -fsS https://totaload-ocr.onrender.com/health
   # -> { "upstage": "configured", "codex": "...", "gemini": "configured" }
   ```

Any single missing key only disables that provider — the other two still work.

## 보안 / Security notes

- **주민등록번호 (resident registration number) 평문 저장**. MVP — no auth (ADR-004). Search/list
  responses never include it; PDF generation does. Production usage would need column-level
  encryption + access control.
- All credentials (`UPSTAGE_API_KEY`, `GEMINI_API_KEY`, `CODEX_AUTH_JSON`, `DATABASE_URL`) live in
  env only (`sync: false` in Render, gitignored locally). The repo contains no keys.

## 한계 / Known limitations

- **No auth / RBAC / audit log** (ADR-004). Intended for internal small-team use.
- **OCR is not a guarantee.** All three providers can hallucinate; the operator is the final
  reviewer. The system never blocks the workflow on OCR failure — manual entry always works.
- **PDF upload OCRs only page 1** (ADR-010). Multi-page scans use the front page; back-side
  attachments are kept for reference.
- **Synchronous OCR call** with a 90s timeout (ADR-009). Async job queue is future work.
- **No concurrent-edit detection** — last-write-wins (acceptable at this scale).
- **File storage = Postgres bytea** (ADR-011). Supabase free is 500 MB ≈ 200–250 vehicles. Beyond
  that, migrate to R2/S3 (one file in `services/vehicles.ts` and a column rename).

## 운영 메모 / Ops notes

- **DB capacity**: file bytes consume DB storage. Keep an eye on Supabase/Neon usage.
- **Cold start**: free-plan web services sleep after ~15 min of idle → first request takes 30–60
  s while three containers wake up. UptimeRobot pinging `/api/health` every 5 min mitigates this,
  or upgrade `totaload-backend` to Starter ($7/mo).
- **Codex token expiry**: rerun `codex login` locally → repaste `~/.codex/auth.json` into
  `CODEX_AUTH_JSON` → redeploy ocr service.
