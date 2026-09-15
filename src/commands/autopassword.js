import { PermissionFlagsBits } from 'discord.js';
import { PREFIX } from '../config.js';
import {
  AUTO_PASSWORD_TYPES,
  configureAutoPasswordChannel,
  getAutoPasswordChannels,
  getAutoPasswordTypeLabel,
  normalizeAutoPasswordType,
  pauseAutoPasswordChannel,
  removeAutoPasswordChannel,
} from '../lib/auto-password.js';
import { buildAutoPasswordEnablePanel, buildAutoPasswordPanel } from '../lib/ui.js';

function getChannel(message, args = []) {
  const mentioned = message.mentions?.channels?.first?.();
  if (mentioned) return mentioned;
  const rawId = args
    .find((value) => /^\d{10,}$/.test(value) || /^<#\d+>$/.test(value))
    ?.replace(/[<#>]/g, '');
  return rawId ? message.guild.channels.cache.get(rawId) : null;
}

function getType(args, channel) {
  const raw = args
    .filter((value) => value !== channel?.id && !/^<#\d+>$/.test(value))
    .join(' ')
    .trim();
  return normalizeAutoPasswordType(raw);
}

function findConfiguredChannel(message, args) {
  const channel = getChannel(message, args);
  return channel || getAutoPasswordChannels(message.guildId)
    .find((item) => args.includes(item.channelId));
}

export default {
  name: 'autopassword',
  aliases: ['autopass', 'passwordauto'],
  execute({ message, args }) {
    if (!message.guild) return 'This command can only be used in a server.';
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to configure Auto Password.';
    }

    const action = (args[0] || 'status').toLowerCase();
    if (action === 'status' || action === 'panel') return buildAutoPasswordPanel(message.guildId);
    if (action === 'enable' && !args.slice(1).length) return buildAutoPasswordEnablePanel();

    if (['on', 'enable'].includes(action)) {
      const channel = getChannel(message, args.slice(1));
      const type = getType(args.slice(1), channel);
      if (!channel) return '❌ Select an Auto Password input channel.';
      if (!channel.isTextBased?.()) return '❌ The Auto Password channel must be a text channel.';
      if (!type) {
        return `❌ Select one exact account type: ${AUTO_PASSWORD_TYPES
          .map((item) => `\`${item.label}\``).join(', ')}.`;
      }
      try {
        configureAutoPasswordChannel(message.guildId, channel.id, type);
        return `✅ Auto Password enabled\nChannel: <#${channel.id}>\nType: ${getAutoPasswordTypeLabel(type)}`;
      } catch (error) {
        return `❌ ${error.message}`;
      }
    }

    if (action === 'off' || action === 'disable') {
      const target = findConfiguredChannel(message, args.slice(1));
      if (!target?.channelId) {
        return '❌ Specify the channel to disable so other Auto Password channels remain unchanged.';
      }
      try {
        pauseAutoPasswordChannel(message.guildId, target.channelId, true);
        return `⏸️ Auto Password paused for <#${target.channelId}>. Queued work is saved.`;
      } catch (error) {
        return `❌ ${error.message}`;
      }
    }

    if (action === 'remove') {
      const target = findConfiguredChannel(message, args.slice(1));
      if (!target?.channelId) return '❌ Specify the channel to remove.';
      removeAutoPasswordChannel(message.guildId, target.channelId);
      return `✅ Auto Password removed for <#${target.channelId}>. Other channels were not changed.`;
    }

    return `❌ Use \`${PREFIX}autopassword status\`, \`${PREFIX}autopassword on [type] [#channel]\`, or \`${PREFIX}autopassword off [#channel]\`.`;
  },
};