const fs = require('fs');
const path = require('path');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  createPendingProof,
  clearPendingByUser,
  getLatestPendingProofByUser,
  setPendingMode,
  deletePendingProof,
} = require('../lib/pendingProofRepository');

const {
  createMoneyEntry,
  getEntryById,
  deleteMoneyEntry,
  getRecentEntriesForDelete,
} = require('../lib/moneyRepository');

const { refreshDashboardMessage } = require('./dashboard');
const { sendMoneyLog, sendMoneyDeleteLog } = require('./sendMoneyLog');

const commands = new Map();
const commandsPath = path.join(__dirname, '..', 'commands');

for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  commands.set(command.data.name, command);
}

async function safeReply(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

function getTodayBangkokDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function buildMoneyModal(type) {
  const modal = new ModalBuilder()
    .setCustomId(`money:modal:${type}`)
    .setTitle(type === 'income' ? 'เพิ่มรายรับ' : 'เพิ่มรายจ่าย');

  const amount = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('จำนวนเงิน')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('เช่น 1500');

  const category = new TextInputBuilder()
    .setCustomId('category')
    .setLabel('หมวดหมู่')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('เช่น ค่าอาหาร / เงินเดือน');

  const note = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('หมายเหตุ')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const entryDate = new TextInputBuilder()
    .setCustomId('entry_date')
    .setLabel('วันที่ (YYYY-MM-DD) - เว้นว่าง = วันนี้')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('เช่น 2026-03-09');

  modal.addComponents(
    new ActionRowBuilder().addComponents(amount),
    new ActionRowBuilder().addComponents(category),
    new ActionRowBuilder().addComponents(note),
    new ActionRowBuilder().addComponents(entryDate),
  );

  return modal;
}

function buildProofFallbackButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('money:proof:upload_here')
        .setLabel('อัปโหลดรูปในห้องนี้')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('money:proof:skip')
        .setLabel('บันทึกโดยไม่แนบรูป')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('money:proof:cancel')
        .setLabel('ยกเลิก')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildDeleteOptions(entries) {
  return entries.slice(0, 25).map((entry) => {
    const typeLabel = entry.type === 'income' ? 'รายรับ' : 'รายจ่าย';
    const amountText = Number(entry.amount).toLocaleString();
    const categoryText = entry.category || '-';
    const dateText = entry.entry_date ? String(entry.entry_date).slice(0, 10) : '-';
    const noteText = entry.note || 'ไม่มีหมายเหตุ';

    return {
      label: `${typeLabel} | ${amountText} | ${categoryText}`.slice(0, 100),
      description: `${dateText} | ${noteText}`.slice(0, 100),
      value: String(entry.id),
    };
  });
}

async function finalizeEntry(client, pending, proofUrl) {
  const entry = await createMoneyEntry({
    guildId: pending.guild_id,
    userId: pending.user_id,
    type: pending.type,
    amount: pending.amount,
    category: pending.category,
    note: pending.note,
    entryDate: pending.entry_date,
    proofUrl,
  });

  await deletePendingProof(pending.id);
  await refreshDashboardMessage(client, pending.guild_id).catch(console.error);
  await sendMoneyLog(client, pending.guild_id, entry).catch(console.error);

  return entry;
}

async function handleModal(client, interaction) {
  const type = interaction.customId.split(':')[2];

  const amountRaw = (interaction.fields.getTextInputValue('amount') || '').trim();
  const category = (interaction.fields.getTextInputValue('category') || '').trim();
  const note = (interaction.fields.getTextInputValue('note') || '').trim();

  let rawEntryDate = '';
  try {
    rawEntryDate = (interaction.fields.getTextInputValue('entry_date') || '').trim();
  } catch {
    rawEntryDate = '';
  }

  const entryDate = rawEntryDate === '' ? getTodayBangkokDate() : rawEntryDate;
  const amount = Number(amountRaw.replace(/,/g, ''));

  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return safeReply(interaction, {
      content: 'จำนวนเงินไม่ถูกต้อง',
    });
  }

  if (!category) {
    return safeReply(interaction, {
      content: 'กรุณากรอกหมวดหมู่',
    });
  }

  if (rawEntryDate !== '' && !isValidDateString(rawEntryDate)) {
    return safeReply(interaction, {
      content: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD หรือเว้นว่างไว้เพื่อใช้วันที่ปัจจุบัน',
    });
  }

  await clearPendingByUser(interaction.user.id);

  const pending = await createPendingProof({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    type,
    amount,
    category,
    note,
    entryDate,
    mode: 'dm',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  console.log('trying DM user:', interaction.user.id, interaction.user.tag);
  console.log('rawEntryDate:', JSON.stringify(rawEntryDate));
  console.log('final entryDate:', entryDate);

  try {
    const dm = await interaction.user.createDM();
    await dm.send({
      content:
        `ส่งรูปหลักฐานสำหรับ${type === 'income' ? 'รายรับ' : 'รายจ่าย'}ในแชตนี้ได้เลยภายใน 5 นาที\n` +
        `จำนวน: ${amount}\nหมวดหมู่: ${category}\nวันที่: ${entryDate}\n\n` +
        `ถ้าไม่ต้องการแนบรูป ให้พิมพ์ skip`,
    });

    return safeReply(interaction, {
      content: `บอทส่ง DM ให้แล้ว วันที่ที่ใช้คือ ${entryDate}`,
      components: buildProofFallbackButtons(),
    });
  } catch (error) {
    console.error('DM failed:', error);
    console.error('DM failed code:', error?.code);
    console.error('DM failed status:', error?.status);
    console.error('DM failed message:', error?.rawError?.message || error?.message);

    await setPendingMode(pending.id, 'channel');

    return safeReply(interaction, {
      content:
        `ส่ง DM ไม่สำเร็จ\ncode: ${error?.code || 'unknown'}\nmessage: ${error?.rawError?.message || error?.message || 'unknown'}\n\n` +
        `วันที่ที่ใช้คือ ${entryDate}\n` +
        `กดปุ่มด้านล่างเพื่ออัปโหลดรูปในห้องนี้แทน หรือเลือกบันทึกโดยไม่แนบรูป`,
      components: buildProofFallbackButtons(),
    });
  }
}

async function handleDeleteSelect(interaction) {
  const entryId = Number(interaction.values[0]);
  const entry = await getEntryById(entryId);

  if (!entry || entry.guild_id !== interaction.guildId) {
    return interaction.update({
      content: 'ไม่พบรายการนี้แล้ว',
      embeds: [],
      components: [],
    });
  }

  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && entry.user_id !== interaction.user.id) {
    return interaction.update({
      content: 'คุณไม่มีสิทธิ์ลบรายการนี้',
      embeds: [],
      components: [],
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('ยืนยันการลบรายการ')
    .setColor(0xff4444)
    .setDescription('ตรวจสอบข้อมูลก่อนลบ')
    .addFields(
      {
        name: 'ประเภท',
        value: entry.type === 'income' ? 'รายรับ' : 'รายจ่าย',
        inline: true,
      },
      {
        name: 'จำนวนเงิน',
        value: Number(entry.amount).toLocaleString(),
        inline: true,
      },
      {
        name: 'หมวดหมู่',
        value: entry.category || '-',
        inline: true,
      },
      {
        name: 'วันที่',
        value: entry.entry_date ? String(entry.entry_date).slice(0, 10) : '-',
        inline: true,
      },
      {
        name: 'หมายเหตุ',
        value: entry.note || '-',
        inline: false,
      },
      {
        name: 'ผู้บันทึก',
        value: `<@${entry.user_id}>`,
        inline: true,
      },
      {
        name: 'ID',
        value: String(entry.id),
        inline: true,
      },
    );

  if (entry.proof_url) {
    embed.addFields({
      name: 'หลักฐาน',
      value: entry.proof_url,
      inline: false,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`money:delete:confirm:${entry.id}`)
      .setLabel('ยืนยันลบ')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('money:delete:cancel')
      .setLabel('ยกเลิก')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({
    embeds: [embed],
    components: [row],
  });
}

async function handleDeleteConfirm(client, interaction) {
  const entryId = Number(interaction.customId.split(':')[3]);
  const entry = await getEntryById(entryId);

  if (!entry || entry.guild_id !== interaction.guildId) {
    return interaction.update({
      content: 'ไม่พบรายการนี้แล้ว หรือรายการถูกลบไปแล้ว',
      embeds: [],
      components: [],
    });
  }

  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && entry.user_id !== interaction.user.id) {
    return safeReply(interaction, {
      content: 'คุณไม่มีสิทธิ์ลบรายการนี้',
    });
  }

  const deleted = await deleteMoneyEntry(entryId);

  if (!deleted) {
    return interaction.update({
      content: 'ลบไม่สำเร็จ หรือรายการถูกลบไปแล้ว',
      embeds: [],
      components: [],
    });
  }

  await refreshDashboardMessage(client, interaction.guildId).catch(console.error);
  await sendMoneyDeleteLog(client, interaction.guildId, deleted, interaction.user).catch(console.error);

  return interaction.update({
    content: `ลบรายการ #${deleted.id} เรียบร้อยแล้ว`,
    embeds: [],
    components: [],
  });
}

async function handleButton(client, interaction) {
  if (interaction.customId === 'money:add_income') {
    return interaction.showModal(buildMoneyModal('income'));
  }

  if (interaction.customId === 'money:add_expense') {
    return interaction.showModal(buildMoneyModal('expense'));
  }

  if (interaction.customId === 'money:refresh') {
    await refreshDashboardMessage(client, interaction.guildId);
    return safeReply(interaction, { content: 'รีเฟรช dashboard แล้ว' });
  }

  if (interaction.customId === 'money:proof:upload_here') {
    const pending = await getLatestPendingProofByUser(interaction.user.id);
    if (!pending) {
      return safeReply(interaction, { content: 'ไม่พบรายการที่รอแนบรูป' });
    }

    await setPendingMode(pending.id, 'channel');
    return safeReply(interaction, { content: 'ส่งรูปเป็นไฟล์ในห้องนี้ได้เลยภายใน 5 นาที' });
  }

  if (interaction.customId === 'money:proof:skip') {
    const pending = await getLatestPendingProofByUser(interaction.user.id);
    if (!pending) {
      return safeReply(interaction, { content: 'ไม่พบรายการที่รอดำเนินการ' });
    }

    await finalizeEntry(client, pending, null);
    return safeReply(interaction, { content: 'บันทึกรายการเรียบร้อยแล้วโดยไม่แนบรูป' });
  }

  if (interaction.customId === 'money:proof:cancel') {
    const pending = await getLatestPendingProofByUser(interaction.user.id);
    if (pending) {
      await deletePendingProof(pending.id);
    }
    return safeReply(interaction, { content: 'ยกเลิกรายการที่รออยู่แล้ว' });
  }

  if (interaction.customId.startsWith('money:delete:confirm:')) {
    return handleDeleteConfirm(client, interaction);
  }

  if (interaction.customId === 'money:delete:cancel') {
    return interaction.update({
      content: 'ยกเลิกการลบแล้ว',
      embeds: [],
      components: [],
    });
  }
}

async function handleSlashCommand(client, interaction) {
  if (interaction.commandName === 'deletemoney') {
    const entries = await getRecentEntriesForDelete(
      interaction.guildId,
      interaction.user.id,
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator),
    );

    if (!entries.length) {
      return safeReply(interaction, {
        content: 'ไม่พบรายการที่คุณมีสิทธิ์ลบ',
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('เลือกรายการที่ต้องการลบ')
      .setDescription('เลือกรายการล่าสุดจากเมนูด้านล่าง')
      .setColor(0xff9900);

    const select = new StringSelectMenuBuilder()
      .setCustomId('money:delete:select')
      .setPlaceholder('เลือกรายการที่ต้องการลบ')
      .addOptions(buildDeleteOptions(entries));

    return safeReply(interaction, {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;
  return command.execute(interaction, client);
}

async function handleInteractionCreate(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      return handleSlashCommand(client, interaction);
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'money:delete:select') {
        return handleDeleteSelect(interaction);
      }
    }

    if (interaction.isButton()) {
      return handleButton(client, interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModal(client, interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const payload = {
      content: `เกิดข้อผิดพลาด: ${error.message || 'unknown error'}`,
    };

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ ...payload, ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
      }
    }
  }
}

module.exports = {
  handleInteractionCreate,
  finalizeEntry,
};