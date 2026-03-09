-- Discord Money Bot - full schema migration
-- รันไฟล์นี้ครั้งเดียวกับ PostgreSQL เดิมที่ schema ไม่ตรงกับโปรเจกต์

BEGIN;

CREATE TABLE IF NOT EXISTS guild_money_panels (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_channel_id TEXT
);

ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS log_channel_id TEXT;

ALTER TABLE guild_money_panels ALTER COLUMN created_by DROP NOT NULL;

CREATE TABLE IF NOT EXISTS money_entries (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  entry_date DATE,
  proof_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS proof_url TEXT;

UPDATE money_entries
SET entry_date = COALESCE(entry_date, created_at::date, CURRENT_DATE)
WHERE entry_date IS NULL;

ALTER TABLE money_entries ALTER COLUMN entry_date SET NOT NULL;

CREATE TABLE IF NOT EXISTS pending_money_proofs (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  entry_date DATE NOT NULL,
  mode TEXT NOT NULL DEFAULT 'dm' CHECK (mode IN ('dm', 'channel')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_money_proofs ADD COLUMN IF NOT EXISTS mode TEXT;
UPDATE pending_money_proofs SET mode = 'dm' WHERE mode IS NULL;
ALTER TABLE pending_money_proofs ALTER COLUMN mode SET DEFAULT 'dm';
ALTER TABLE pending_money_proofs ALTER COLUMN mode SET NOT NULL;

DELETE FROM pending_money_proofs
WHERE expires_at <= NOW();

COMMIT;
