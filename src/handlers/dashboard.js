const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getSummary, getRecentEntries, getPanelByGuild } = require('../lib/moneyRepository');
const { money } = require('../utils/format');

function makeBar(value, total, size = 12) {
  if (!total || total <= 0) return '░'.repeat(size);
  const filled = Math.max(0, Math.min(size, Math.round((value / total) * size)));
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function buildRecentLines(recentEntries) {
  if (!recentEntries.length) {
    return 'ยังไม่มีรายการล่าสุด ลองกดปุ่มด้านล่างเพื่อเริ่มบันทึกได้เลย';
  }

  return recentEntries
    .slice(0, 6)
    .map((entry, index) => {
      const icon = entry.type === 'income' ? '🟢' : '🔴';
      const typeLabel = entry.type === 'income' ? 'รายรับ' : 'รายจ่าย';
      const proof = entry.proof_url ? ' • 📎 หลักฐาน' : '';
      const note = entry.note ? `\n└ ${entry.note.slice(0, 60)}` : '';
      return `**${index + 1}. ${icon} ${typeLabel} — ${entry.category}**\n${money(entry.amount)} • ${formatDate(entry.entry_date)}${proof}${note}`;
    })
    .join('\n\n');
}

function buildHealthText(summary) {
  if (summary.totalCount === 0) return 'เริ่มบันทึกข้อมูลเพื่อให้ dashboard สรุปภาพรวมให้อัตโนมัติ';
  if (summary.balance > 0) return 'สถานะตอนนี้ยังบวกอยู่ ใช้ดูแนวโน้มรายรับรายจ่ายได้โอเคเลย';
  if (summary.balance < 0) return 'ตอนนี้รายจ่ายมากกว่ารายรับ ลองเช็กหมวดที่ใช้หนัก ๆ จากรายการล่าสุด';
  return 'รายรับและรายจ่ายตอนนี้สมดุลพอดี';
}

function buildDashboardEmbed(summary, recentEntries, logChannelId) {
  const flowTotal = Math.max(summary.totalIncome + summary.totalExpense, 1);
  const incomeBar = makeBar(summary.totalIncome, flowTotal);
  const expenseBar = makeBar(summary.totalExpense, flowTotal);
  const balanceIcon = summary.balance >= 0 ? '💰' : '⚠️';
  const color = summary.balance >= 0 ? 0x22c55e : 0xef4444;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('💸 Money Dashboard')
    .setDescription(
      [
        `${balanceIcon} **ภาพรวมการเงินของเซิร์ฟเวอร์**`,
        buildHealthText(summary),
        '',
        `**Flow รายรับ/รายจ่าย**`,
        `รายรับ  ${incomeBar} ${money(summary.totalIncome)}`,
        `รายจ่าย ${expenseBar} ${money(summary.totalExpense)}`,
      ].join('\n'),
    )
    .addFields(
      {
        name: '📥 รายรับรวม',
        value: `**${money(summary.totalIncome)}**`,
        inline: true,
      },
      {
        name: '📤 รายจ่ายรวม',
        value: `**${money(summary.totalExpense)}**`,
        inline: true,
      },
      {
        name: '🧮 คงเหลือสุทธิ',
        value: `**${money(summary.balance)}**`,
        inline: true,
      },
      {
        name: '📝 จำนวนรายการ',
        value: `${summary.totalCount} รายการ`,
        inline: true,
      },
      {
        name: '📎 ห้อง Log',
        value: logChannelId ? `<#${logChannelId}>` : '`ยังไม่ได้ตั้งค่า`',
        inline: true,
      },
      {
        name: '🕒 อัปเดตล่าสุด',
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
      {
        name: '📚 รายการล่าสุด',
        value: buildRecentLines(recentEntries),
        inline: false,
      },
    )
    .setFooter({ text: 'กดปุ่มด้านล่างเพื่อเพิ่มรายการหรือรีเฟรชข้อมูล' })
    .setTimestamp(new Date());
}

function buildButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('money:add_income').setLabel('เพิ่มรายรับ').setEmoji('📥').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('money:add_expense').setLabel('เพิ่มรายจ่าย').setEmoji('📤').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('money:refresh').setLabel('รีเฟรช Dashboard').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    ),
  ];
}

async function refreshDashboardMessage(client, guildId) {
  const panel = await getPanelByGuild(guildId);
  if (!panel) return;

  const channel = await client.channels.fetch(panel.channel_id).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(panel.message_id).catch(() => null);
  if (!message) return;

  const summary = await getSummary(guildId);
  const recentEntries = await getRecentEntries(guildId);

  await message.edit({
    embeds: [buildDashboardEmbed(summary, recentEntries, panel.log_channel_id)],
    components: buildButtons(),
  });
}

module.exports = {
  buildDashboardEmbed,
  refreshDashboardMessage,
};
