const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getPanelByGuild, setLogChannel } = require('../lib/moneyRepository');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmoneylog')
    .setDescription('ตั้งค่าห้อง log รายรับรายจ่าย')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('ห้องที่จะใช้เก็บ log')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะแอดมิน', ephemeral: true });
    }

    const panel = await getPanelByGuild(interaction.guildId);
    if (!panel) {
      return interaction.reply({ content: 'กรุณาใช้ /setupmoney ก่อน', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel', true);
    await setLogChannel(interaction.guildId, channel.id);
    return interaction.reply({ content: `ตั้งห้อง log เป็น ${channel} แล้ว`, ephemeral: true });
  },
};
