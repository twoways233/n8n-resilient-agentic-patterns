-- Auto-created on first Postgres container start (docker-entrypoint-initdb.d)

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'PROCESSING', -- PROCESSING | resolved | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_mapping_cache (
  rule_id          TEXT PRIMARY KEY,
  source_id        TEXT NOT NULL,
  drifted_key      TEXT NOT NULL,
  target_key       TEXT NOT NULL,
  confidence       NUMERIC NOT NULL,
  learned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_value_hash TEXT,
  hit_count        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active', -- active | revoked
  UNIQUE (source_id, drifted_key)
);

CREATE TABLE IF NOT EXISTS dlq (
  dlq_id          TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload         JSONB NOT NULL,
  failure_reason  TEXT,
  status          TEXT NOT NULL DEFAULT 'failed', -- failed | replaying | resolved | re_failed | dead_permanent
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS business_leads (
  id          BIGSERIAL PRIMARY KEY,
  source_id   TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  email       TEXT,
  amount      NUMERIC,
  company     TEXT,
  plan        TEXT,
  raw_payload JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, event_id)
);
