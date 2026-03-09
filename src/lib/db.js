const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl && config.databaseUrl.includes('localhost')
    ? false
    : config.databaseUrl
      ? { rejectUnauthorized: false }
      : false,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function columnExists(tableName, columnName) {
  const result = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return result.rowCount > 0;
}

async function initDatabase() {
  await query(`
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
  `);

  await query(`
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
  `);

  await query(`
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
  `);

  await query(`ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS created_by TEXT;`);
  await query(`ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await query(`ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await query(`ALTER TABLE guild_money_panels ADD COLUMN IF NOT EXISTS log_channel_id TEXT;`);

  await query(`ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS entry_date DATE;`);
  await query(`ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS proof_url TEXT;`);

  if (await columnExists('money_entries', 'created_at')) {
    await query(`
      UPDATE money_entries
      SET entry_date = COALESCE(entry_date, created_at::date, CURRENT_DATE)
      WHERE entry_date IS NULL;
    `);
  } else {
    await query(`
      UPDATE money_entries
      SET entry_date = CURRENT_DATE
      WHERE entry_date IS NULL;
    `);
  }

  await query(`ALTER TABLE money_entries ALTER COLUMN entry_date SET NOT NULL;`);

  await query(`ALTER TABLE pending_money_proofs ADD COLUMN IF NOT EXISTS mode TEXT;`);
  await query(`UPDATE pending_money_proofs SET mode = 'dm' WHERE mode IS NULL;`);
  await query(`ALTER TABLE pending_money_proofs ALTER COLUMN mode SET DEFAULT 'dm';`);
  await query(`ALTER TABLE pending_money_proofs ALTER COLUMN mode SET NOT NULL;`);

  await query(`
    DELETE FROM pending_money_proofs
    WHERE expires_at <= NOW();
  `);
}

module.exports = {
  pool,
  query,
  initDatabase,
};
