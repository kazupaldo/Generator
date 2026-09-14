import { PermissionFlagsBits } from 'discord.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { PREFIX } from '../config.js';
import {
  getAutoPasswordConfig,
  setAutoPasswordConfig,
} from '../lib/settings.js';
import { getApiKeyStorageStatus } from '../lib/api-keys.js';

function getChannel(message, args) {
  const mentioned = message.mentions?.channels?.first?.();
  if (mentioned) return mentioned;
  const rawId = args
    .find((value) => /^\d{10,}$/.test(value) || /^<#\d+>$/.test(value))
    ?.replace(/[<#>]/g, '');
  return rawId ? message.guild.channels.cache.get(rawId) : null;
}

function parseType(args, channel) {
  const remaining = args
    .filter((value) => value !== channel?.id && !/^<#\d+>$/.test(value))
    .join(' ')
    .trim();
  if (!remaining || remaining.toLowerCase() === 'all') return [];
  const match = ACCOUNT_TYPES.find((type) => type.toLowerCase() === remaining.toLowerCase());
  return match ? [match] : null;
}

function statusText(guildId) {
  const config = getAutoPasswordConfig(guildId);
  if (!config.enabled) {
    return `🔐 Automatic password changes are **disabled**.\nEnable with \`${PREFIX}autopassword on\`.`;
  }
  const scope = config.types?.length ? config.types.join(', ') : 'all account types';
  const channel = config.channelId ? `<#${config.channelId}>` : 'no extra notice channel';
  return `🔐 Automatic password changes are **enabled** for **${scope}**.\n` +
    'Password format: `KazuShop` + digit + uppercase letter + digit + uppercase letter (example: `KazuShop8H3G`).\n' +
    `Password-change notice channel: ${channel}\n` +
    'The full new username and password are sent privately; the optional channel receives only a masked notice.';
}

export default {
  name: 'autopassword',
  aliases: ['autopass', 'passwordauto'],
  execute({ message, args }) {
    if (!message.guild) return 'This command can only be used in a server.';
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to configure automatic password changes.';
    }

    const action = (args[0] || 'status').toLowerCase();
    if (action === 'status') return statusText(message.guildId);

    if (action === 'off' || action === 'disable') {
      if (!setAutoPasswordConfig(message.guildId, { enabled: false })) {
        return '❌ I could not save the automatic password settings. Check that the bot can write to its project folder.';
      }
      return '✅ Automatic password changes are disabled.';
    }

    if (!['on', 'enable'].includes(action)) {
      return `❌ Use \`${PREFIX}autopassword on [type] [#channel]\`, \`${PREFIX}autopassword off\`, or \`${PREFIX}autopassword status\`.`;
    }

    if (!getApiKeyStorageStatus().ready) {
      return '❌ Configure `SESSION_SECRET` first. It is required to store the new passwords securely.';
    }

    const channel = getChannel(message, args.slice(1));
    const types = parseType(args.slice(1), channel);
    if (types === null) {
      return `❌ Invalid account type. Available: ${ACCOUNT_TYPES.map((type) => `\`${type}\``).join(', ')}, or \`all\`.`;
    }

    if (channel && !channel.isTextBased?.()) {
      return '❌ The notice destination must be a text channel.';
    }

    if (!setAutoPasswordConfig(message.guildId, {
      enabled: true,
      types,
      channelId: channel?.id ?? null,
    })) {
      return '❌ I could not save the automatic password settings. Check that the bot can write to its project folder.';
    }
    return `✅ Automatic password changes enabled for **${types.length ? types.join(', ') : 'all account types'}**.\n` +
      `Full new credentials will be sent privately${channel ? `; <#${channel.id}> receives a masked notice` : ''}.`;
  },
};