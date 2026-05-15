# Step 4: frontend

## 읽어야 할 파일

- `docs/UI_GUIDE.md` — **§4.1~4.7 전부(UX 원칙 / 정보구조 / 말소 입력·검수 화면 상태 A·B·C / 말소 검색 / 차량 상세 / 전역 UX 요소 / 비주얼 토큰). 이 step 의 명세는 이 문서다 — 정독하라.**
- `docs/ARCHITECTURE.md` — §2.5(API 명세 — 프론트가 호출), §2.3(데이터 흐름), §2.8(UX/프론트엔드 엣지).
- `docs/PRD.md` — §1.3(핵심 기능), §1.5(시나리오 S1~S5), §1.7(SSN 마스킹).
- `CLAUDE.md` — 1부 원칙.
- step3 산출물 / `phases/0-mvp/index.json` step3 summary: API 베이스(`/api`)와 엔드포인트별 요청/응답 shape — 이 계약에 정확히 맞춰라.
- `frontend/` — step0 의 Vite+React+TS+Tailwind 스캐폴드.

## 작업

`docs/UI_GUIDE.md` 의 UX 설계를 그대로 구현한다. React + TS + Tailwind + react-router. 서버 상태는 TanStack Query(react-query) 권장(없이 fetch+state 도 가능하나 캐시/로딩 처리가 손이 더 감).

### 라우팅 & 레이아웃
- `SidebarLayout`: 좌측 고정 사이드바(폭 ~220px) — 상단 "Hanaru AI ERP", 메뉴 2개 **말소 입력**(→`/malso/new`)·**말소 검색**(→`/malso/search`), 현재 위치 active. 우측 `<Outlet/>`.
- 라우트: `/` → redirect `/malso/new`; `/malso/new` = `MalsoInputPage`(상태 A); `/malso/:id` = `MalsoInputPage`(상태 C, 또는 검색 진입 시 = 상세); `/malso/search` = `MalsoSearchPage`.

### 공통 컴포넌트 (`src/components/`)
- `Dropzone` — 드래그&드롭 + 클릭 선택, `accept="image/*,application/pdf"` + 모바일 카메라 허용, 클라이언트 1차 검증(타입/≤20MB) 실패 시 인라인 한 줄 안내.
- `ImageViewer` — 이미지(또는 PDF 1페이지 렌더 결과) 표시 + 휠/버튼 확대·축소 + 드래그 이동 + 90° 회전 + "원본 다운로드". 여러 장이면 썸네일 전환. (라이브러리 사용 OK, 예 `react-zoom-pan-pinch`.)
- `ToastProvider`/`useToast` — 우하단, ~3s, 닫기 가능, 에러 토스트는 "재시도" 액션 가능.
- `ConfirmModal` — Esc 로 닫힘.
- `PdfPreviewModal` — `<iframe>`/`<embed>` 로 blob URL 미리보기 + 다운로드 + 인쇄("실제 크기(100%)로 인쇄하세요" 안내) + "닫고 계속 수정" + "새 말소 입력 시작". 브라우저가 못 열면 다운로드 링크 폴백.
- `EmptyState`, `Skeleton`, `StatusBadge`(작성중/완료), `FieldRow`(라벨 + 입력 + 칩["자동 입력"/"수정됨"] + amber "확인 필요" 표시 + 가벼운 형식 안내).
- `VehicleForm` — 검수 폼 본체(섹션: 소유자 / 차량 / 신청서). **말소 입력 상태 C 와 차량 상세에서 동일 컴포넌트 재사용.** props 로 `vehicleId`, 초기값, OCR fields, OCR status. 내부에서 자동 저장(디바운스 PATCH) + "만진 필드" 집합 관리.

### `MalsoInputPage`
- **상태 A (`/malso/new`)**: 중앙 `Dropzone` + 아래 "작성 중" 목록(= `search?q=` 빈값 결과 중 status='draft' 상위 N개, 또는 별도 표시) — 클릭 시 `/malso/:id`. 비면 안내.
- 파일 드롭 시: **즉시** 2열 레이아웃으로 전환하고 좌=선택 이미지 미리보기, 우=빈 `VehicleForm` + 파란 "분석 중…" 배너 + "분석 취소". 동시에 `POST /api/malso` 호출(이미지 업로드, 백엔드가 OCR 까지 동기 수행 — 최대 ~90s).
  - 사용자가 그 사이 입력한 필드 = "만진 필드" 로 기록. 응답 도착 시: `vehicle.id` 로 라우트를 `/malso/:id` 로 `replace`, 응답 `fields` 를 **만지지 않은 필드에만** 채움(만진 필드는 사용자 값 유지 → 다음 자동 저장 PATCH 로 영속). `ocrStatus`/`warnings`/`errorCode` 로 배너 갱신(ok=초록·partial=노랑+누락항목·failed=노랑+사유+"다시 분석").
  - 업로드 자체 실패(네트워크) → 에러 토스트("재시도") + 입력값 유지(레코드 없음 → 재시도 시 다시 `POST /api/malso`).
  - "분석 취소" → UI 만 수동 입력 모드로(배너 제거); 백엔드 요청은 끝까지 가더라도 결과는 무시. (이미 응답이 와서 vehicle 이 생성됐다면 그 id 로 이동해 계속.)
- **상태 C (`/malso/:id`)**: `GET /api/malso/:id` → 좌 `ImageViewer`(첨부 등록증 이미지들), 우 `VehicleForm`(섹션·칩·amber·SSN 마스킹 토글·가벼운 형식 안내) + 하단 sticky 액션바: **"말소등록 신청서 PDF 만들기"** → 저장(현재 값) → `POST /api/malso/:id/pdf` → `PdfPreviewModal`(blob). 중요한 필드(차대번호·차량번호·소유자명)가 비었으면 `ConfirmModal`("○○가 비어 있습니다. 그대로 만들까요?") 후 진행. 응답 `X-Missing-Fields` 있으면 토스트로 안내. "다시 분석"(=새 이미지 첨부 후 재OCR, 또는 기존 이미지 재분석) — "현재 입력값을 OCR 결과로 덮어쓸까요?(수동 수정값 포함)" 확인, 기본은 "빈 칸만 채우기". 추가 이미지 첨부(첨부만)도 가능.
- 자동 저장: `VehicleForm` 이 필드 blur 또는 ~0.8s idle 시 `PATCH /api/malso/:id`. 상태 미세 표시("저장 중…/저장됨 HH:MM"). 디바운스 + in-flight 1개, stale 무시. 저장 실패 누적 시 상단 경고 + "다시 저장" + 라우트 이탈 시 confirm.

### `MalsoSearchPage`
- 상단 큰 검색 입력(placeholder "차량번호 또는 차대번호 일부 입력", 좌 돋보기, 우 ✕). 입력 즉시 디바운스 300ms 로 `GET /api/malso/search?q=`. 1자부터. q 비면 "최근 차량"(빈 q 호출 결과).
- 결과 행: 차량번호 · 차명 · 소유자명 · `StatusBadge` · 등록일. 매칭 부분문자열 하이라이트. 클릭/Enter → `/malso/:id`. **owner_ssn 표시 안 함**(API 도 안 줌).
- 0건: "‘OOO’에 해당하는 차량이 없습니다." + "말소 입력에서 새로 추가" 링크. >50건: "더 정확히 입력하면 범위를 좁힐 수 있습니다." 로딩: 행 스켈레톤, 이전 결과는 흐리게 유지, 응답 순서 보장(stale 무시).

### 차량 상세 = `/malso/:id`
- 위 상태 C 와 동일 화면(검수=수정=재생성). 추가로 "첨부 문서" 영역: 등록증 이미지(들) + 생성된 말소등록 신청서 PDF 목록(생성 시각, 최신 위, 각 미리보기/다운로드/인쇄). 상단 차량 요약(차량번호·차명·상태·생성/수정 시각) + "← 검색으로".

### API 클라이언트 (`src/api/`)
- 타입 정의(step3 계약 그대로) + `fetch` 래퍼(에러 → `{code,message}` 정규화, AbortController 지원, 응답 순서 보장 유틸). react-query 훅: `useUploadMalso`, `useVehicle(id)`, `usePatchVehicle`, `useGeneratePdf`, `useSearch(q)`.

### 비주얼
`docs/UI_GUIDE.md §4.7` 토큰 준수. AI 슬롭 금지(글래스/그라데이션 텍스트/보라 브랜드색/글로우/blur orb/모든 카드 동일 rounded-2xl). 무채색 + amber(빈/확인필요·partial/failed) + green(완료/성공) + red(에러). 좌측 정렬, 중앙정렬 남용 금지. fade-in 정도만.

## Acceptance Criteria

```bash
npm -w frontend run build      # tsc + vite build, 에러 없음
npm -w frontend run lint
npm -w frontend test           # (선택) vitest+testing-library: "만진 필드 보호" 머지 로직, 검색 디바운스 유틸 단위 테스트
npm run build && npm run lint && npm run test   # 루트 전체
# 그리고 backend(+postgres) 와 ocr-service(또는 모킹) 를 띄운 상태에서 README 의 "수동 UX 체크리스트" 를 통과:
#  1) /malso/new 에서 샘플 등록증 드롭 → 즉시 2열·빈 폼·"분석 중" 배너; 그 사이 '주행거리'에 값 입력
#     → 응답 도착 시 '주행거리'는 사용자 값 유지, 나머지 빈 칸만 OCR 값으로 채워짐; URL 이 /malso/:id 로 바뀜
#  2) 그 페이지 새로고침 → /malso/:id 로 복구, 입력값 보존; /malso/new 의 "작성 중" 목록에도 그 차량이 보임
#  3) 좌측 이미지 확대/이동/90° 회전 동작
#  4) 필드 수정 → "저장됨 HH:MM" 표시; 백엔드를 잠깐 죽이면 저장 실패 경고 + 라우트 이탈 시 confirm
#  5) "말소등록 신청서 PDF 만들기" → 미리보기 모달 → 다운로드/인쇄; 중요한 필드 비우고 시도 → confirm 후 빈 채로 생성 + 누락 안내 토스트
#  6) /malso/search 에서 차량번호/차대번호 일부 입력 → 디바운스 검색, 매칭 하이라이트; 검색어 비우면 "최근 차량"; 없는 값 → 0건 메시지; 결과/목록에 주민번호 안 보임; 행 클릭 → 상세
#  7) 상세에서 SSN 칸 마스킹 + 눈 아이콘 토글
#  8) 키보드(Tab/Enter/Esc)만으로 업로드→입력→PDF 생성까지 가능
```

## 검증 절차

1. 위 AC 실행(빌드/린트/테스트는 필수; 수동 UX 체크리스트는 backend·ocr-service 가 떠 있어야 — 가능하면 `docker compose up` 후 수행, 불가하면 그 사실을 summary 에 명시).
2. 체크리스트: §4 의 모든 화면/상태/요소가 구현됐는가? §2.8 의 UX 엣지(OCR 중 동시 입력 보호, 새로고침 복구, 자동 저장 race, 동시 편집 last-write-wins, PDF 미리보기 폴백, stale 검색 응답, 연타 방지, 다중 첨부 OCR 범위)가 반영됐는가? AI 슬롭 안티패턴 없는가? SSN 평문이 목록/검색 화면에 안 보이는가? CLAUDE.md 단순함(필요 이상 추상화 금지)?
3. `phases/0-mvp/index.json` step 4 업데이트: 성공 → `"completed"`, `"summary"` 에 라우트·주요 컴포넌트(`VehicleForm` 재사용 포함)·상태 관리 방식·dev 서버 포트·수동 UX 체크리스트 통과 여부 한 줄 요약.

## 금지사항

- AI 슬롭 안티패턴 금지: backdrop-blur(글래스), 그라데이션 텍스트, 보라/인디고 브랜드색, 글로우 애니메이션, 모든 카드 동일 rounded-2xl, blur-3xl orb. 이유: `docs/UI_GUIDE.md` — "매일 쓰는 도구".
- OCR 결과로 사용자가 만진(직접 입력/수정한) 필드를 덮어쓰지 마라. 이유: §4.1 원칙 3 — 신뢰·데이터 보호.
- 주민등록번호 평문을 목록/검색 화면에 표시하지 마라. 이유: §1.7.
- 백엔드 API 계약(step3)을 임의로 바꾸지 마라 — 프론트를 계약에 맞춰라. 정 필요하면 멈추고 사유를 적어라.
- 인증/로그인 화면을 만들지 마라(MVP 제외). 상태 관리 라이브러리·UI 키트를 과하게 끌어들이지 마라.
- 기존 테스트/빌드를 깨뜨리지 마라.
