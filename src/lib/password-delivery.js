import { getNewPasswordChannel } from './settings.js';
import {
  buildPasswordChangePayload,
  buildPasswordProcessingPayload,
} from './ui.js';

async function resolvePasswordChannel(client, guildId) {
  const channelId = getNewPasswordChannel(guildId);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

export async function sendPasswordProcessing(client, { guildId, username }) {
  const channel = await resolvePasswordChannel(client, guildId);
  if (!channel) return null;
  return channel.send(buildPasswordProcessingPayload(username, guildId)).catch((error) => {
    console.error('Could not send password processing message:', error.message);
    return null;
  });
}

export async function finishPasswordProcessing(message, account, { guildId, ownerId }) {
  if (!message) return null;
  return message.edit(buildPasswordChangePayload(account, {
    guildId,
    ownerId,
    destination: `<#${message.channelId}>`,
  })).catch((error) => {
    console.error('Could not update password processing message:', error.message);
    return null;
  });
}

export async function failPasswordProcessing(message, username, error, guildId) {
  if (!message) return null;
  const payload = buildPasswordProcessingPayload(username, guildId);
  payload.embeds[0]
    .setColor(0xed4245)
    .setDescription('❌ Password change failed')
    .addFields({ name: 'Error', value: String(error || 'Unknown error').slice(0, 1024) });
  return message.edit(payload).catch(() => null);
}

export async function sendPasswordChangeResult(client, account, { guildId, ownerId }) {
  const channel = await resolvePasswordChannel(client, guildId);
  if (!channel) return null;
  return channel.send(buildPasswordChangePayload(account, {
    guildId,
    ownerId,
    destination: `<#${channel.id}>`,
  })).catch((error) => {
    console.error('Could not send password result:', error.message);
    return null;
  });
}