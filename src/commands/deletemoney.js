const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const { getRecentEntriesForDelete } = require('../lib/moneyRepository');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletemoney')
    .setDescription('เลือกลบรายการรายรับ/รายจ่ายจากรายการล่าสุด')
    .setDMPermission(false),

  async execute(interaction) {
    const entries = await getRecentEntriesForDelete(interaction.guildId, interaction.user);

    if (!entries.length) {
      return interaction.reply({
        content: 'ไม่พบรายการที่คุณมีสิทธิ์ลบ',
        ephemeral: true,
      });
    }

    const options = entries.slice(0, 25).map((entry) => ({
      label: `${entry.type === 'income' ? 'รายรับ' : 'รายจ่าย'} | ${Number(entry.amount).toLocaleString()} | ${entry.category}`.slice(0, 100),
      description: `${entry.entry_date} | ${entry.note || 'ไม่มีหมายเหตุ'}`.slice(0, 100),
      value: String(entry.id),
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId('money:delete:select')
      .setPlaceholder('เลือกรายการที่ต้องการลบ')
      .addOptions(options);

    const embed = new EmbedBuilder()
      .setTitle('เลือกรายการที่ต้องการลบ')
      .setDescription('เลือกจากรายการล่าสุดด้านล่าง')
      .setColor(0xff9900);

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },
};