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
  PermissionFlagsBits,
} = require('discord.js');
const { createPendingProof, clearPendingByUser, getLatestPendingProofByUser, setPendingMode, deletePendingProof } = require('../lib/pendingProofRepository');
const { createMoneyEntry } = require('../lib/moneyRepository');
const { refreshDashboardMessage } = require('./dashboard');
const { sendMoneyLog } = require('./sendMoneyLog');

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

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const [year, month, day] = value.split('-').map(Number);
  return (
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
      new ButtonBuilder().setCustomId('money:proof:upload_here').setLabel('อัปโหลดรูปในห้องนี้').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('money:proof:skip').setLabel('บันทึกโดยไม่แนบรูป').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('money:proof:cancel').setLabel('ยกเลิก').setStyle(ButtonStyle.Danger),
    ),
  ];
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

  // จุดสำคัญ: ถ้าว่างจริง ให้กลายเป็นวันที่วันนี้ทันที
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

  // เช็กวันที่เฉพาะตอนที่ "ผู้ใช้กรอกมาเอง"
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
    if (!pending) return safeReply(interaction, { content: 'ไม่พบรายการที่รอแนบรูป' });
    await setPendingMode(pending.id, 'channel');
    return safeReply(interaction, { content: 'ส่งรูปเป็นไฟล์ในห้องนี้ได้เลยภายใน 5 นาที' });
  }

  if (interaction.customId === 'money:proof:skip') {
    const pending = await getLatestPendingProofByUser(interaction.user.id);
    if (!pending) return safeReply(interaction, { content: 'ไม่พบรายการที่รอดำเนินการ' });
    await finalizeEntry(client, pending, null);
    return safeReply(interaction, { content: 'บันทึกรายการเรียบร้อยแล้วโดยไม่แนบรูป' });
  }

  if (interaction.customId === 'money:proof:cancel') {
    const pending = await getLatestPendingProofByUser(interaction.user.id);
    if (pending) await deletePendingProof(pending.id);
    return safeReply(interaction, { content: 'ยกเลิกรายการที่รออยู่แล้ว' });
  }
}

async function handleInteractionCreate(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      return command.execute(interaction, client);
    }

    if (interaction.isButton()) {
      return handleButton(client, interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModal(client, interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const payload = { content: `เกิดข้อผิดพลาด: ${error.message || 'unknown error'}` };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ ...payload, ephemeral: true }).catch(() => null);
      else await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
    }
  }
}

module.exports = { handleInteractionCreate, finalizeEntry };
