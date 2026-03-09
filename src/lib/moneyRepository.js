const { PermissionsBitField } = require('discord.js');
const { query } = require('./db');

async function upsertPanel({ guildId, channelId, messageId, createdBy }) {
  const result = await query(
    `
      INSERT INTO guild_money_panels (
        guild_id,
        channel_id,
        message_id,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (guild_id)
      DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        message_id = EXCLUDED.message_id,
        updated_at = NOW()
      RETURNING *
    `,
    [guildId, channelId, messageId, createdBy || null],
  );
  return result.rows[0] || null;
}

async function getPanelByGuild(guildId) {
  const result = await query(
    `SELECT * FROM guild_money_panels WHERE guild_id = $1 LIMIT 1`,
    [guildId],
  );
  return result.rows[0] || null;
}

async function setLogChannel(guildId, logChannelId) {
  const result = await query(
    `
      UPDATE guild_money_panels
      SET log_channel_id = $2,
          updated_at = NOW()
      WHERE guild_id = $1
      RETURNING *
    `,
    [guildId, logChannelId],
  );
  return result.rows[0] || null;
}

async function createMoneyEntry({ guildId, userId, type, amount, category, note, entryDate, proofUrl }) {
  const result = await query(
    `
      INSERT INTO money_entries
      (guild_id, user_id, type, amount, category, note, entry_date, proof_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `,
    [guildId, userId, type, amount, category, note || null, entryDate, proofUrl || null],
  );
  return result.rows[0] || null;
}

async function getSummary(guildId) {
  const result = await query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COUNT(*)::int AS total_count
      FROM money_entries
      WHERE guild_id = $1
    `,
    [guildId],
  );
  const row = result.rows[0] || { total_income: '0', total_expense: '0', total_count: 0 };
  return {
    totalIncome: Number(row.total_income || 0),
    totalExpense: Number(row.total_expense || 0),
    balance: Number(row.total_income || 0) - Number(row.total_expense || 0),
    totalCount: Number(row.total_count || 0),
  };
}

async function getRecentEntries(guildId, limit = 8) {
  const result = await query(
    `
      SELECT *
      FROM money_entries
      WHERE guild_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [guildId, limit],
  );
  return result.rows;
}

async function getRecentEntriesForDelete(guildId, userId, isAdmin = false) {
  const result = isAdmin
    ? await query(
        `
        SELECT id, guild_id, user_id, type, amount, category, note, entry_date, proof_url, created_at
        FROM money_entries
        WHERE guild_id = $1
        ORDER BY created_at DESC
        LIMIT 25
        `,
        [guildId]
      )
    : await query(
        `
        SELECT id, guild_id, user_id, type, amount, category, note, entry_date, proof_url, created_at
        FROM money_entries
        WHERE guild_id = $1
          AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 25
        `,
        [guildId, userId]
      );

  return result.rows;
}

async function getEntryById(id) {
  const result = await query(
    `
    SELECT *
    FROM money_entries
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function deleteMoneyEntry(id) {
  const result = await query(
    `
    DELETE FROM money_entries
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  upsertPanel,
  getPanelByGuild,
  setLogChannel,
  createMoneyEntry,
  getSummary,
  getRecentEntries,
  getRecentEntriesForDelete,
  getEntryById,
  deleteMoneyEntry,
};
