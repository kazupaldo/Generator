import { EmbedBuilder } from 'discord.js';
import { getHealth } from '../bloxgen.js';
import { COLORS } from '../config.js';
import {
  getHealthChannel,
  getHealthMessage,
  setHealthMessage,
} from './settings.js';
import { getAutoPasswordSummary } from './auto-password.js';

function buildHealthEmbed({ apiOk, guildId, lastCheck = new Date() }) {
  const summary = getAutoPasswordSummary(guildId);
  const { totals } = summary;
  return new EmbedBuilder()
    .setTitle('💚 Kazu Bot Health')
    .setColor(apiOk ? COLORS.success : COLORS.error)
    .setDescription(
      `Status: ${apiOk ? '🟢 Online' : '🔴 API Offline'}\n` +
      `Auto Password: ${summary.activeChannels ? '🟢 Running' : '⚪ Paused / Disabled'}\n` +
      `Active Channels: ${summary.activeChannels}\n` +
      `Generated: ${totals.generated}\nChanged: ${totals.changed}\n` +
      `Failed: ${totals.failed}\nUnknown: ${totals.unknown}\n` +
      `Last Update: <t:${Math.floor(lastCheck.getTime() / 1000)}:t>`,
    );
}

export async function updateHealthMessage(client, guildId, { autoPassword } = {}) {
  const channelId = getHealthChannel(guildId);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const health = await getHealth();
  const payload = {
    embeds: [buildHealthEmbed({
      apiOk: health.ok,
      guildId,
    })],
  };
  let message = null;
  const messageId = getHealthMessage(guildId);
  if (messageId) message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) {
    await message.edit(payload).catch(() => {});
  } else {
    message = await channel.send(payload).catch(() => null);
    if (message) setHealthMessage(guildId, message.id);
  }
  return message;
}