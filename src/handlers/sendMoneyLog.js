const { EmbedBuilder } = require('discord.js');
const { getPanelByGuild } = require('../lib/moneyRepository');
const { money } = require('../utils/format');

async function sendMoneyLog(client, guildId, entry) {
  const panel = await getPanelByGuild(guildId);
  if (!panel?.log_channel_id) return;

  const channel = await client.channels.fetch(panel.log_channel_id).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(entry.type === 'income' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย')
    .addFields(
      { name: 'จำนวนเงิน', value: money(entry.amount), inline: true },
      { name: 'หมวดหมู่', value: entry.category || '-', inline: true },
      { name: 'วันที่', value: String(entry.entry_date), inline: true },
      { name: 'หมายเหตุ', value: entry.note || '-', inline: false },
      { name: 'ผู้บันทึก', value: `<@${entry.user_id}>`, inline: true },
    )
    .setTimestamp(new Date(entry.created_at || Date.now()));

  if (entry.proof_url) {
    embed.addFields({ name: 'หลักฐาน', value: entry.proof_url, inline: false });
    embed.setImage(entry.proof_url);
  }

  await channel.send({ embeds: [embed] });
}

async function sendMoneyDeleteLog(client, guildId, entry, deletedByUser) {
  const panel = await getPanelByGuild(guildId);
  if (!panel?.log_channel_id) return;

  const channel = await client.channels.fetch(panel.log_channel_id).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('ลบรายการรายรับ/รายจ่าย')
    .setColor(0xff3333)
    .addFields(
      { name: 'ID', value: String(entry.id), inline: true },
      { name: 'ประเภท', value: entry.type === 'income' ? 'รายรับ' : 'รายจ่าย', inline: true },
      { name: 'จำนวนเงิน', value: Number(entry.amount).toLocaleString(), inline: true },
      { name: 'หมวดหมู่', value: entry.category || '-', inline: true },
      { name: 'วันที่', value: String(entry.entry_date), inline: true },
      { name: 'หมายเหตุ', value: entry.note || '-', inline: false },
      { name: 'เจ้าของรายการ', value: `<@${entry.user_id}>`, inline: true },
      { name: 'ผู้ลบ', value: `<@${deletedByUser.id}>`, inline: true }
    )
    .setTimestamp();

  if (entry.proof_url) {
    embed.addFields({ name: 'หลักฐานเดิม', value: entry.proof_url, inline: false });
    embed.setImage(entry.proof_url);
  }

  await channel.send({ embeds: [embed] });
}

module.exports = { 
  sendMoneyLog,
  sendMoneyDeleteLog,
 };
