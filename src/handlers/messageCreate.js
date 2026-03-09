const { ChannelType } = require('discord.js');
const { getLatestPendingProofByUser } = require('../lib/pendingProofRepository');
const { finalizeEntry } = require('./interactionCreate');

function isImageAttachment(att) {
  if (!att) return false;
  if (att.contentType && att.contentType.startsWith('image/')) return true;
  const name = (att.name || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => name.endsWith(ext));
}

async function handlePendingProofMessage(client, message) {
  if (message.author.bot) return;

  const pending = await getLatestPendingProofByUser(message.author.id);
  if (!pending) return;

  const isDm = message.channel.type === ChannelType.DM;
  const isGuildTarget = message.guild && message.guild.id === pending.guild_id && message.channel.id === pending.channel_id;

  if ((pending.mode === 'dm' && !isDm) || (pending.mode === 'channel' && !isGuildTarget)) {
    return;
  }

  const text = (message.content || '').trim().toLowerCase();
  if (text === 'skip') {
    await finalizeEntry(client, pending, null);
    await message.reply('บันทึกรายการเรียบร้อยแล้วโดยไม่แนบรูป');
    return;
  }

  const image = [...message.attachments.values()].find(isImageAttachment);
  if (!image) {
    await message.reply('กรุณาส่งไฟล์รูปภาพ หรือพิมพ์ skip หากไม่ต้องการแนบรูป');
    return;
  }

  await finalizeEntry(client, pending, image.url);
  await message.reply('บันทึกรายการพร้อมรูปหลักฐานเรียบร้อยแล้ว');
}

module.exports = { handlePendingProofMessage };
