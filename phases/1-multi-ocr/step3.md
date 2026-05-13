# Step 3: deploy-and-readme

## 읽어야 할 파일
- step0~2 산출물 / `phases/1-multi-ocr/index.json` 누적 summary.
- `render.yaml`, `Dockerfile.ocr`, `.env.example`, `README.md`.

## 작업
1. **`render.yaml`** — `totaload-ocr` 의 `envVars` 에 다음 두 항목 추가(둘 다 `sync: false`):
   - `UPSTAGE_API_KEY`
   - `GEMINI_API_KEY`
   기존 `CODEX_AUTH_JSON` 유지.
2. **`.env.example`** — 같은 두 키 추가 (값 없이).
3. **`Dockerfile.ocr`** — 추가 의존성 불필요(`httpx` 이미 있음). 변경 없음.
4. **`README.md` — 면접관 시점 최적화 재작성 (영어)**.
   - **최상단**: 한 줄 pitch + **🟢 Live demo: https://totaload-frontend.onrender.com** 큼지막하게.
   - **"Try it in 30 seconds"** 섹션: ① 위 URL 클릭 → ② 사이드바 "말소 입력" → ③ 샘플 등록증 드래그 (또는 본인 자동차등록증) → ④ 우측 상단에서 Upstage / Codex / Gemini 토글 비교 → ⑤ "PDF 만들기" 로 채워진 신청서 다운로드. cold-start 첫 요청 ~30s 안내.
   - **"What this is"**: 트리닉(중고차 수출사) ERP MVP — 자동차등록증 OCR → 말소등록 신청서 PDF 자동작성 + 검색. 1분 절약/건.
   - **"Why Upstage as the primary OCR"**: ① 한국어 문서 강점, ② Document Parse 의 레이아웃 보존 + Solar Chat 의 구조화 추출 2-step 이 등록증의 변형(영업용/구버전/스캔) 에 강함, ③ 결정적·낮은 지연(codex CLI 의 LLM-thinking 오버헤드 없음).
   - **"Architecture"**: 3-service (React SPA / Express API / FastAPI OCR-PDF) + Postgres. 다이어그램 1개. provider 추상화 위치 (`ocr-service/app/providers/{upstage,codex,gemini}.py`) 짚어주기.
   - **"Comparing OCR providers"**: 같은 등록증으로 3개 backend 호출 — 같은 정규화/검증 파이프라인. 결과 표(시간·정확도)는 비워두고 reader 가 직접 비교하도록 안내.
   - **"Stack & decisions"**: TypeScript 전부, Postgres bytea (ADR-011), 무료 배포(Render Free + Supabase), pg 직접(no ORM), test-first.
   - 기존 "로컬 실행 / 배포 / 보안 / 한계 / 운영 메모" 는 그대로 *하단* 으로 이동 (개발자/배포 담당용).
   - 페이지 하단: 기여자·라이선스 (현재 없으면 생략).
5. **`docs/ADR.md`** — 신규 ADR-012 "Multi-provider OCR (Upstage primary)" 추가. 결정·이유(과제·실험)·트레이드오프(provider 별 인증/한도/지연 다름)·대안 검토(Vision API 직접 등).

## Acceptance Criteria
```bash
npm run lint && npm run build && npm run test
python3 -c "import yaml; yaml.safe_load(open('render.yaml'))"
test -s README.md && grep -qi 'live demo' README.md && grep -qi 'upstage' README.md
```

## 검증 절차
1. 위 AC.
2. `phases/1-multi-ocr/index.json` step 3 → "completed". 그 후 `phases/index.json` 의 phase 상태 "completed".

## 금지사항
- 비밀값을 README·yaml·Dockerfile 에 적지 마라.
- 기존 ADR(006/011 등) 의 결정을 함부로 뒤집지 마라 — 새 ADR 로만 보강.
- 한국어 사용자 메시지를 영어로 일괄 변경 금지 — 앱 UI 언어는 그대로(KR), README 만 영어.
