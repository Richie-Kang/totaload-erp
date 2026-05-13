# Step 2: frontend-provider-selector

## 읽어야 할 파일
- step1 산출물 (`/api/malso` 의 `provider` 폼 필드, `ocrProvider` 응답).
- `frontend/src/pages/MalsoInputPage.tsx`, `frontend/src/api/{client.ts,hooks.ts,types.ts}`, `frontend/src/components/VehicleForm.tsx`.

## 작업
1. **타입 추가** `api/types.ts`: `export type OcrProvider = 'upstage' | 'codex' | 'gemini';` + `UploadResponse.ocrProvider?: OcrProvider`.
2. **`api/hooks.ts`**: `useUploadMalso` 가 `(file: File, provider: OcrProvider)` 받음. FormData 에 `provider` 동봉.
3. **`pages/MalsoInputPage.tsx`** — 우측 상단에 provider selector:
   - 순서 **Upstage(기본) → Codex → Gemini**. radio segmented control 형태(`<button>` 3개, active = `bg-neutral-200 text-black`).
   - 옆에 작은 설명 캡션: "Upstage Document OCR · 메인" / "Codex (CLI vision)" / "Gemini 1.5 Flash".
   - localStorage `totaload.ocrProvider` 에 저장·복원. 기본 `upstage`.
   - 업로드 시 이 값을 `useUploadMalso` 에 전달.
4. **`VehicleForm.tsx` 배너** — ocrResult 에 `provider` 가 있으면 status 메시지 끝에 `(by Upstage)` 식으로 라벨. 한국어 일관성 유지.
5. **유닛 테스트**: `frontend/src/test/` 에 selector 의 localStorage 라운드트립 / 기본값 / 변경 테스트.

## Acceptance Criteria
```bash
npm -w frontend run build && npm -w frontend run lint && npm -w frontend test
```
브라우저 수동: 셀렉터 변경 → 새로고침 → 선택 유지. 업로드 → 분석 배너에 provider 라벨 표시.

## 검증 절차
1. 위 AC.
2. `phases/1-multi-ocr/index.json` step 2 → "completed".

## 금지사항
- 셀렉터를 사이드바·라우트로 만들지 마라 — 입력 화면 한 곳에만.
- localStorage 키 충돌 피해라 (`totaload.` prefix).
- AI 슬롭 톤(글래스/그라데이션) 금지.
