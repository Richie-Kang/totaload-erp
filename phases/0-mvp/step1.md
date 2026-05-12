# Step 1: db-schema

## 읽어야 할 파일

먼저 읽고 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — 특히 §2.4(데이터 모델), §2.7(에러 처리: DB), §2.8(DB 엣지 케이스).
- `docs/ADR.md` — ADR-006(파일 저장), 철학.
- `CLAUDE.md` — 1부 원칙.
- `backend/` — step0 이 만든 Express+TS 스캐폴드(`backend/src/index.ts`, `backend/package.json`).
- `docker-compose.yml`, `.env.example` — DB 접속 정보(`DATABASE_URL`).

step0 이 만든 백엔드 코드를 정독하고 그 위에 얹어라.

## 작업

PostgreSQL 스키마 + 연결 풀 + 멱등 마이그레이션. **API 라우트는 만들지 마라**(step3). 백엔드가 부팅 시 마이그레이션을 돌리고 `/api/health` 가 DB 상태를 포함하는 정도까지만.

1. `backend/src/db/schema.sql` — 멱등(`CREATE ... IF NOT EXISTS`):
   - `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (gen_random_uuid 용)
   - `vehicles` 테이블, 컬럼(타입은 ARCHITECTURE.md §2.4 그대로):
     `id uuid primary key default gen_random_uuid()`, `reg_no text`, `vin text`, `owner_name text`, `owner_ssn text`, `owner_address text`, `model text`, `year text`, `mileage integer`, `weight integer`, `total_weight integer`, `app_date text`, `note text`, `raw_ocr jsonb`, `ocr_status text not null default 'failed'`, `status text not null default 'draft'`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
   - `documents` 테이블: `id uuid primary key default gen_random_uuid()`, `vehicle_id uuid not null references vehicles(id) on delete cascade`, `kind text not null`, `file_path text not null`, `orig_name text`, `mime text not null`, `size_bytes integer not null`, `created_at timestamptz not null default now()`.
   - 인덱스(`IF NOT EXISTS`): `vehicles` 의 `lower(replace(coalesce(reg_no,''),' ',''))` 와 `lower(replace(coalesce(vin,''),' ',''))` 각각(검색 부분일치용), `vehicles(updated_at desc)`, `documents(vehicle_id)`.
   - 중복 방지용 부분 unique index: `create unique index if not exists vehicles_vin_uniq on vehicles (vin) where vin is not null and vin <> '';` (앱 레벨에서 먼저 SELECT 하지만 경합 대비 23505 처리도 한다 — step3.)
   - `updated_at` 자동 갱신: 트리거(`before update ... set new.updated_at = now()`) 또는 앱에서 항상 명시. **앱에서 명시하는 쪽으로 통일**(단순함) — 트리거 만들지 마라.
2. `backend/src/db/pool.ts` — `pg.Pool` 을 `process.env.DATABASE_URL` 로 생성. 연결 실패 시 백오프 재시도(예: 1s,2s,4s … 최대 ~10회) 후 그래도 안 되면 명확한 에러 throw. `query<T>(sql, params)` 헬퍼 export.
3. `backend/src/db/migrate.ts` — `schema.sql` 을 읽어 단일 트랜잭션으로 실행. 멱등이므로 여러 번 호출해도 안전. `runMigrations(): Promise<void>` export. 실패 시 명확한 에러로 throw(부팅 중단).
4. `backend/package.json` 의 `migrate` 스크립트를 `tsx src/db/migrate-cli.ts`(또는 동등) 로 채워 `npm -w backend run migrate` 가 동작하게 하라.
5. `backend/src/index.ts` 수정(외과적): 부팅 시 `await runMigrations()` 호출 후 listen. `GET /api/health` 를 `{status:'ok', db:'ok'|'down'}` 로 — DB 에 `select 1` 핑(실패 시 `db:'down'`, 200 유지).
6. `backend/test/` 에 vitest 테스트: `DATABASE_URL`(compose 의 postgres) 가 있으면 `runMigrations()` 를 **두 번** 호출해도 에러 없고, 그 후 `select to_regclass('vehicles')` 와 `select to_regclass('documents')` 가 non-null, 위 인덱스들이 `pg_indexes` 에 존재함을 확인. `DATABASE_URL` 미설정이면 테스트를 skip(하드 실패 금지).

## Acceptance Criteria

```bash
docker compose up -d postgres                 # 또는 로컬 postgres
export DATABASE_URL=postgresql://totaload:totaload@localhost:5432/totaload   # .env.example 과 동일
npm -w backend run build
npm -w backend run migrate                    # 1회
npm -w backend run migrate                    # 2회 — 멱등, 에러 없음
psql "$DATABASE_URL" -c "select to_regclass('vehicles'), to_regclass('documents');"   # 둘 다 non-null
npm -w backend test                           # 통과 (또는 DATABASE_URL 없으면 skip)
npm run build && npm run lint                  # 루트 전체 무에러
```

## 검증 절차

1. 위 AC 실행.
2. 아키텍처 체크리스트: 컬럼/타입/인덱스가 ARCHITECTURE.md §2.4 와 정확히 일치하는가? ORM 안 썼는가(pg 직접)? CLAUDE.md 단순함 위반 없는가? 라우트를 만들지 않았는가(step3 영역 침범 금지)?
3. `phases/0-mvp/index.json` step 1 업데이트: 성공 → `"completed"`, `"summary"` 에 `backend/src/db/schema.sql`·`pool.ts`·`migrate.ts` 경로, `query` 헬퍼 시그니처, `migrate` npm 스크립트, `/api/health` 가 db 상태 포함함을 한 줄 요약(step3 가 이걸 확장).

## 금지사항

- ORM/쿼리빌더(Prisma, Knex, TypeORM 등)를 도입하지 마라. 이유: ADR — pg 직접, 단순함.
- 컬럼·테이블을 ARCHITECTURE.md §2.4 와 다르게 만들지 마라. 이유: 이후 step 들이 이 스키마에 의존한다.
- API 라우트(`/api/malso` 등)를 만들지 마라. 이유: step3 의 scope.
- `updated_at` 트리거를 만들지 마라 — 앱이 update 시 항상 `updated_at = now()` 를 명시한다. 이유: 동작 위치를 한 곳으로.
- 기존 테스트/빌드를 깨뜨리지 마라.
