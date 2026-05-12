# Step 6: polish-and-verify

## 읽어야 할 파일

- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md` — 전부. 특히 ARCHITECTURE.md §2.8(에러·엣지 카탈로그), §6(검증) 에 해당하는 부분.
- `CLAUDE.md` — 1부 원칙.
- step0~5 산출물 / `phases/0-mvp/index.json` 의 모든 step summary.
- `README.md`.

## 작업

새 기능 추가 없음. **전체 검증 + 카탈로그 점검 + 마무리.**

1. **전체 e2e 검증** (가능한 만큼 자동화, 나머지 수동):
   - `docker compose up --build` → `http://localhost:5173`.
   - **S1 정상**: `assets/samples` 의 등록증 이미지 업로드 → 폼에 추출값 표시(빈 필드 amber) → 주행거리·연식 보정 → "말소등록 신청서 PDF 만들기" → 생성 PDF 를 pypdf 로 다시 열어 **12 폼필드 전부**(특히 `vehicle_year `(끝 공백)·`vehicle_vin_1`==`vehicle_vin_2`·`current_date`) 채워졌는지 확인.
   - **S2/S3 OCR 부분/실패**: 흐린/관계없는 이미지 → 배너 partial/failed, 폼은 계속 사용 가능, 수동 입력 후 PDF 생성 성공. `CODEX_AUTH_JSON` 비우고 재기동 → failed 폴백.
   - **S4 검색**: 차량번호/차대번호 일부 입력 → 목록(주민번호 없음) → 클릭 → 상세에 모든 필드 + 등록증 이미지 + 생성 PDF + SSN 마스킹/토글 → 상세에서 수정·재생성.
   - **S5 중복**: 같은 등록증 재업로드 → 새 레코드 안 생기고 기존 레코드 편집 화면.
   - **에러 표본**: 잘못된 타입(거부), 25MB(거부), 없는 id(404), 검색에 `%`/따옴표(안 깨짐), ocr-service 중단 후 업로드(이미지 저장 + 빈 폼).
   - **UX 표본** (`docs/UI_GUIDE.md` 의 항목들): 긴 대기 중 입력 → OCR 빈칸만 채움 / 새로고침 후 `/malso/:id` 복구 / 이미지 확대·이동·회전 / 자동 저장 "저장됨 HH:MM" + 저장 실패 경고 / PDF 미리보기·인쇄 / 검색 디바운스·하이라이트·빈상태·"최근 차량" / 키보드만으로 전 과정.
2. **§2.8 카탈로그 점검**: ARCHITECTURE.md §2.8 의 모든 항목(업로드/입력·OCR/codex·PDF·DB·검색·파일서빙·배포/운영·UX/프론트엔드)을 하나씩 짚어 "어디서 처리되는지(파일/함수)" 를 `docs/CHECKLIST.md` 에 표로 정리. 누락 발견 시 **최소 수정**으로 보강(새 기능 아님 — 빠진 에러 처리 채우기).
3. **README 마무리**: 로컬 실행·배포·보안·디스크 경고가 정확한지 확인하고 다듬기. 알려진 한계(OCR 정확도, 로그인 없음, PDF 1페이지 OCR 등)를 "한계" 절에 명시.
4. **Stop 훅 대비**: `npm run lint && npm run build && npm run test` 가 통과하는지 확인(이게 매 세션 종료 시 자동 실행됨). 실패하면 고친다.
5. **메모**: 향후 과제(인증·권한, 컬럼 암호화, OCR 비동기 잡, S3 전환, 백업)를 `docs/ADR.md` 하단 "향후 과제" 절에 한 줄씩 정리(이미 ADR 들에 산재해 있으면 모으기).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test         # Stop 훅과 동일 — 전부 통과
cd ocr-service && python -m pytest -q && cd ..
docker compose up -d --build && sleep 12
curl -fsS http://localhost:4000/api/health && curl -fsS http://localhost:8000/health
# 브라우저로 위 S1~S5 / 에러 표본 / UX 표본 동선 수동 확인 (체크리스트 통과)
docker compose down
test -s docs/CHECKLIST.md
grep -qi '한계\|known limitation' README.md
```

## 검증 절차

1. 위 AC 실행. Docker 불가 환경이면 자동 가능한 것(lint/build/test/pytest)은 반드시 통과시키고, compose 기반 수동 동선은 코드 리뷰로 갈음하되 그 사실을 summary 에 명시.
2. 체크리스트: §2.8 의 모든 항목이 코드 어딘가에서 처리되며 `docs/CHECKLIST.md` 에 매핑돼 있는가? `npm run lint/build/test` 통과? README 가 실제 동작과 일치하는가? ADR 기술 스택·CLAUDE.md 원칙 위반 없는가? MVP 제외 사항(로그인 등)을 실수로 만들지 않았는가?
3. `phases/0-mvp/index.json` step 6 업데이트: 성공 → `"completed"`, `"summary"` 에 검증 결과(어떤 동선이 통과, 어떤 건 환경상 코드리뷰로 갈음), 보강한 항목, `docs/CHECKLIST.md` 생성 사실, Stop 훅 커맨드 통과 여부 한 줄 요약.

## 금지사항

- 새 기능을 추가하지 마라 — 검증·누락 보강·문서 마무리만. 이유: 이 step 의 scope.
- MVP 제외 사항(로그인·권한·재고관리·통계 등)을 구현하지 마라. 이유: §1.8.
- "조심해서" 식으로 넘어가지 마라 — §2.8 항목마다 처리 위치를 실제로 확인하고 CHECKLIST.md 에 적어라. 이유: 빠진 에러 처리를 잡는 게 이 step 의 목적.
- 기존 테스트/빌드를 깨뜨리지 마라.
