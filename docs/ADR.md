# Architecture Decision Records — Totaload ERP

> 이 문서는 `phases/0-mvp/step0` 에서 마스터 계획서 3절을 옮겨 작성했다. 이후 모든 step 의 가드레일로 주입된다.

## 철학
MVP 속도 최우선. 외부 의존성·키 최소화(사용자가 이미 가진 Codex 구독 활용). 작동하는 최소 구현. OCR 은 보조 수단이고 사람의 검수가 최종 책임 — 시스템은 절대 OCR 실패로 업무를 막지 않는다.

---

### ADR-001 — monorepo + 3서비스 분리(React/Node/Python)
**결정**: 한 리포에 frontend/backend/ocr-service.
**이유**: 사용자 지정 스택 + Python 의 pypdf·이미지 처리 + Node 의 빠른 REST·DB.
**트레이드오프**: 서비스 간 호출 1홉, 배포 단위 3개.

### ADR-002 — OCR = 로컬 `codex` CLI 호출(클라우드 OCR API 아님)
**결정**: ocr-service 가 `codex exec -i <img>` 로 멀티모달 추출.
**이유**: 사용자가 이미 Codex 구독 결제, 별도 OCR 키·계정 불필요; 한글 문서 이해·키-값 추출에 LLM 비전이 강함.
**트레이드오프**: CLI 의존(설치·인증·플래그 변동 위험), 비결정적 출력, 지연(수십초), ChatGPT 사용량 한도 종속. 완화: 방어 파싱·항상 수동 폴백·90s 타임아웃.

#### 확인된 codex CLI 인터페이스 (step0, 2026-05-13 / `codex-cli 0.128.0`, macOS)
- **설치됨**: `codex --version` → `codex-cli 0.128.0` (경로 `~/.nvm/versions/node/v24.15.0/bin/codex`). 배포 컨테이너에는 별도 설치 필요(step5).
- **비대화 실행**: `codex exec [OPTIONS] [PROMPT]` (alias `codex e`). 프롬프트는 인자 또는 stdin.
- **이미지 입력 — 지원함**: `-i, --image <FILE>...` (반복 가능, 초기 프롬프트에 이미지 첨부). → 설계 그대로 진행 가능.
- **샌드박스/승인 우회**: `-s, --sandbox <read-only|workspace-write|danger-full-access>`; `--dangerously-bypass-approvals-and-sandbox` (모든 확인 프롬프트 스킵, 외부 샌드박스 환경 전용); `--skip-git-repo-check` (Git 리포 밖에서도 실행); `-C, --cd <DIR>` 작업 루트 지정; `--ephemeral` 세션 파일 비저장; `--ignore-user-config` / `--ignore-rules`.
- **출력 옵션**: `--json` (이벤트를 JSONL 로 stdout 출력); `-o, --output-last-message <FILE>` (에이전트 마지막 메시지를 파일로 기록 — 파싱에 유용); `--output-schema <FILE>` (모델 최종 응답 형태를 JSON Schema 로 강제 — 추출 JSON 안정화에 활용 가능); `--color <always|never|auto>`.
- **모델/기타**: `-m, --model <MODEL>`, `-p, --profile <CONFIG_PROFILE>`, `-c, --config <key=value>`, `--add-dir <DIR>`.
- **권장 호출(step2 에서 확정)**: `codex exec --skip-git-repo-check -s read-only --color never -i <img_path> -o <tmpfile> "<프롬프트>"` 후 `<tmpfile>` 의 마지막 메시지를 방어 파싱. `--output-schema` 로 JSON 형태를 강제하는 방안도 step2 에서 검토.
- 이미지 입력이 어떤 식으로도 지원되지 않는 상황은 **아님** — step2 는 정상 진행.

### ADR-003 — PDF 폼필드 채우기 = Python `pypdf`
**결정**: 템플릿 AcroForm 필드를 `update_page_form_field_values` 로 채우고 `NeedAppearances=true`.
**이유**: 이미 Python 서비스 존재, 필드명 확정됨(12개).
**트레이드오프**: 일부 뷰어 호환·긴 텍스트 오버플로우. 완화: NeedAppearances, 필요시 reportlab 오버레이 fallback.
- 확정된 12개 필드명(정확히 이대로, `vehicle_year ` 의 **끝 공백 포함**): `current_date`, `owner_address`, `owner_name`, `owner_ssn`, `vehicle_mileage`, `vehicle_model`, `vehicle_reg_no`, `vehicle_vin_1`, `vehicle_vin_2`, `vehicle_weight_1`, `vehicle_weight_2`, `vehicle_year ` — step0 에서 `pypdf.PdfReader('assets/malso_application_template.pdf').get_fields()` 로 검증 완료.

### ADR-004 — MVP 에 인증·권한 없음
**결정**: 로그인 미구현, 누구나 접근.
**이유**: 사용자 요청, 사내 소수 사용, 속도.
**트레이드오프**: 주민번호 등 민감정보 노출 위험. 완화: 목록·검색에서 SSN 미노출, 상세에서 마스킹+토글, README 경고, 향후 인증 추가 여지.

### ADR-005 — 배포 = Render Blueprint(`render.yaml`)
**결정**: frontend(static), backend(web), ocr-service(web, Docker), 관리형 PostgreSQL, backend 에 영구 disk.
**이유**: 사용자가 서버 프로비저닝 안 하고도 Blueprint 한 번으로 다서비스+DB 배포; Docker 지원으로 codex CLI 설치 가능.
**트레이드오프**: 벤더 종속, 콜드스타트, 무료 티어 한계. 대안(검토 후 기각): 단일 VPS+compose(사용자가 서버 준비해야 함 — 거부됨), Fly.io(Postgres·디스크 설정 더 번거로움), Vercel+Railway(서비스 분산 복잡).

### ADR-006 — 파일 저장 = 로컬 디스크(S3 아님)
**결정**: backend 에 마운트된 영구 디스크 `storage/`.
**이유**: MVP 단순.
**트레이드오프**: 단일 노드·백업 수동. 향후 S3 전환 여지(스토리지 접근을 함수로 추상화).

### ADR-007 — harness 워크플로우 사용
**결정**: `phases/0-mvp/step{N}.md` + `execute.py` 순차 실행.
**이유**: 프로젝트 컨벤션.
**트레이드오프**: step 자기완결성 작성 부담.

### ADR-008 — codex 인증 = ChatGPT `auth.json` 마운트(서버 env `CODEX_AUTH_JSON`)
**결정**: `OPENAI_API_KEY` 대신 사용자의 ChatGPT 구독 인증 파일을 env 로 주입해 컨테이너 시작 시 `~/.codex/auth.json` 으로 기록.
**이유**: 사용자 선택(추가 API 과금 없음).
**트레이드오프**: 토큰 만료 시 수동 갱신, env 에 자격증명 보관, 약관/한도 종속. 완화: 만료 시 명확 에러+폴백+README 절차.
- 로컬 개발: 호스트의 `~/.codex` 를 docker-compose 로 ocr-service 컨테이너에 read-only 마운트하거나, codex 가 호스트 PATH 에 있으면 그대로 사용.

### ADR-009 — OCR 호출 동기 처리(잡 큐 미도입)
**결정**: 업로드 요청이 codex 완료까지 대기(타임아웃 90s, 로딩 UI).
**이유**: MVP 단순, 트래픽 적음.
**트레이드오프**: 느린 요청·서버 점유. 향후 비동기 잡으로 전환 후보.

### ADR-010 — 입력 PDF 는 첫 페이지만 OCR
**결정**: 등록증을 PDF 로 올리면 1페이지만 이미지 렌더(`pypdfium2`) 후 처리.
**이유**: 단순.
**트레이드오프**: 2페이지 이상 등록증 스캔 시 누락 — 실무상 등록증 앞면이 1페이지라 수용.

---

## 향후 과제 (MVP 범위 밖 — 위 ADR 들에 산재한 것을 모음)

- **인증·권한·감사 로그** — 현재 로그인 없음(ADR-004). 사용자 계정·역할·접근 제어 추가.
- **주민등록번호 컬럼 암호화** — 현재 평문 저장(ADR-004, PRD §7). at-rest 암호화 + 복호화 키 관리.
- **OCR 비동기 잡 큐** — 현재 동기 90s 타임아웃(ADR-009). 업로드 즉시 응답 + 잡 상태 폴링/웹훅으로 전환.
- **파일 저장 S3 전환** — 현재 로컬 디스크(ADR-006). 스토리지 접근이 함수로 추상화돼 있어 교체 지점은 `backend/src/services/storage.ts` 한 곳.
- **DB / 디스크 백업** — 현재 수동(PRD §6). 정기 스냅샷·복구 절차.
- **(검토 후보)** `DELETE /api/malso/:id`(PRD §10), 멀티페이지 등록증 OCR(ADR-010), 동시 편집 충돌 감지(ADR-004), 모바일 전용 UI(PRD §8).
