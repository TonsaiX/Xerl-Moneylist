const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { upsertPanel, getPanelByGuild, getSummary, getRecentEntries } = require('../lib/moneyRepository');
const { buildDashboardEmbed } = require('../handlers/dashboard');

function buildButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('money:add_income').setLabel('เพิ่มรายรับ').setEmoji('📥').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('money:add_expense').setLabel('เพิ่มรายจ่าย').setEmoji('📤').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('money:refresh').setLabel('รีเฟรช Dashboard').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupmoney')
    .setDescription('สร้างหรือรีเซ็ต dashboard รายรับรายจ่าย')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะแอดมิน', ephemeral: true });
    }

    const summary = await getSummary(interaction.guildId);
    const recentEntries = await getRecentEntries(interaction.guildId);
    const oldPanel = await getPanelByGuild(interaction.guildId);

    const msg = await interaction.channel.send({
      embeds: [buildDashboardEmbed(summary, recentEntries, oldPanel?.log_channel_id)],
      components: buildButtons(),
    });

    await upsertPanel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: msg.id,
      createdBy: interaction.user.id,
    });

    return interaction.reply({ content: 'สร้าง dashboard เรียบร้อยแล้ว', ephemeral: true });
  },

  buildButtons,
};
