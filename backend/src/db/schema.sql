-- Totaload ERP — database schema. Idempotent: safe to run on every boot.
-- See docs/ARCHITECTURE.md §2.4. No updated_at trigger — the app always sets updated_at = now() on UPDATE.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS vehicles (
  id            uuid primary key default gen_random_uuid(),
  reg_no        text,
  vin           text,
  owner_name    text,
  owner_ssn     text,
  owner_address text,
  model         text,
  year          text,
  mileage       integer,
  weight        integer,
  app_date      text,
  note          text,
  raw_ocr       jsonb,
  ocr_status    text not null default 'failed',
  status        text not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Older dev/prod DBs had `weight` (공차중량) + `total_weight` (총중량). Consolidated into a single
-- `weight` column whose semantics are the total weight: drop the old weight, rename total_weight.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'total_weight'
  ) THEN
    ALTER TABLE vehicles DROP COLUMN IF EXISTS weight;
    ALTER TABLE vehicles RENAME COLUMN total_weight TO weight;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  kind        text not null,
  file_bytes  bytea not null,
  orig_name   text,
  mime        text not null,
  size_bytes  integer not null,
  created_at  timestamptz not null default now()
);

-- Migrate older dev DBs from file_path (disk-backed) to file_bytes (DB-backed).
-- Production has no prior data; this is just for local DBs created before the switch.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_bytes bytea;
ALTER TABLE documents DROP COLUMN IF EXISTS file_path;

CREATE INDEX IF NOT EXISTS vehicles_reg_no_norm_idx ON vehicles (lower(replace(coalesce(reg_no, ''), ' ', '')));
CREATE INDEX IF NOT EXISTS vehicles_vin_norm_idx ON vehicles (lower(replace(coalesce(vin, ''), ' ', '')));
CREATE INDEX IF NOT EXISTS vehicles_updated_at_idx ON vehicles (updated_at desc);
CREATE INDEX IF NOT EXISTS documents_vehicle_id_idx ON documents (vehicle_id);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vin_uniq ON vehicles (vin) WHERE vin is not null and vin <> '';
