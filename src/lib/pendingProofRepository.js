const { query } = require('./db');

async function clearPendingByUser(userId) {
  await query(`DELETE FROM pending_money_proofs WHERE user_id = $1`, [userId]);
}

async function createPendingProof(data) {
  const result = await query(
    `
      INSERT INTO pending_money_proofs
      (guild_id, channel_id, user_id, type, amount, category, note, entry_date, mode, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
    [
      data.guildId,
      data.channelId,
      data.userId,
      data.type,
      data.amount,
      data.category,
      data.note || null,
      data.entryDate,
      data.mode || 'dm',
      data.expiresAt,
    ],
  );
  return result.rows[0] || null;
}

async function getLatestPendingProofByUser(userId) {
  const result = await query(
    `
      SELECT *
      FROM pending_money_proofs
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  return result.rows[0] || null;
}

async function setPendingMode(id, mode) {
  const result = await query(
    `UPDATE pending_money_proofs SET mode = $2 WHERE id = $1 RETURNING *`,
    [id, mode],
  );
  return result.rows[0] || null;
}

async function deletePendingProof(id) {
  await query(`DELETE FROM pending_money_proofs WHERE id = $1`, [id]);
}

module.exports = {
  clearPendingByUser,
  createPendingProof,
  getLatestPendingProofByUser,
  setPendingMode,
  deletePendingProof,
};
