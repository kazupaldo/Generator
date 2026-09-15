import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { PREFIX } from '../config.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { buildSettingsPanel } from '../lib/ui.js';
import { buildHistoryExport } from '../lib/account-history.js';
import {
  getDelivery,
  getDeliveryChannel,
  getDeliveryChannelsByType,
  setDelivery,
  setDeliveryChannelForType,
  setNewPasswordChannel,
  setHealthChannel,
  getBotTitle,
  setBotTitle,
} from '../lib/settings.js';

export default {
  name: 'settings',
  async execute({ message, args }) {
    const current = getDelivery(message.guildId);
    const currentChannel = getDeliveryChannel(message.guildId);

    if (!message.guild) {
      return 'Settings can only be changed in a server. (Accounts are always DMed in direct messages.)';
    }

    const choice = (args[0] || '').toLowerCase();
    if (!choice) {
      return buildSettingsPanel(message.guildId);
    }
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to change this.';
    }
    if (choice === 'title') {
      if (!args.slice(1).join(' ').trim()) {
        return `Current title: **${getBotTitle(message.guildId)}**. Use \`${PREFIX}settings title <text>\`.`;
      }
      setBotTitle(message.guildId, args.slice(1).join(' '));
      return `✅ Bot title updated to **${getBotTitle(message.guildId)}**.`;
    }
    if (choice === 'password-channel' || choice === 'new-password') {
      const channel = message.mentions?.channels?.first?.() ||
        (args[1] && message.guild.channels.cache.get(args[1]));
      if (!channel?.isTextBased?.()) return `❌ Select a text channel: \`${PREFIX}settings password-channel #channel\`.`;
      setNewPasswordChannel(message.guildId, channel.id);
      return `✅ Successful password changes will be posted in <#${channel.id}>.`;
    }
    if (choice === 'health-channel' || choice === 'health') {
      const channel = message.mentions?.channels?.first?.() ||
        (args[1] && message.guild.channels.cache.get(args[1]));
      if (!channel?.isTextBased?.()) return `❌ Select a text channel: \`${PREFIX}settings health-channel #channel\`.`;
      setHealthChannel(message.guildId, channel.id);
      return `✅ Health updates will be maintained in <#${channel.id}>.`;
    }
    if (choice === 'generator-channel') {
      const channel = message.mentions?.channels?.first?.() ||
        (args[1] && message.guild.channels.cache.get(args[1]));
      if (!channel?.isTextBased?.()) return `❌ Select a text channel: \`${PREFIX}settings generator-channel #channel\`.`;
      setDelivery(message.guildId, 'server', channel.id);
      return `✅ Generated accounts will be posted in <#${channel.id}>.`;
    }
    if (choice === 'export-generated' || choice === 'export-new-passwords' || choice === 'export-changed') {
      const kind = choice === 'export-generated' ? 'generated' : 'changed';
      try {
        const { accounts, file } = buildHistoryExport(kind);
        return {
          content: accounts.length
            ? `📦 Exported **${accounts.length}** ${kind === 'changed' ? 'successful password change' : 'generated account'}${accounts.length === 1 ? '' : 's'}.`
            : '📭 There is no history to export yet.',
          ...(accounts.length ? { files: [file] } : {}),
        };
      } catch (error) {
        return `❌ ${error.message}`;
      }
    }
    if (choice === 'show') {
      const channelText = currentChannel ? `\nDelivery channel: <#${currentChannel}>` : '';
      const typeChannels = getDeliveryChannelsByType(message.guildId);
      const typeText = Object.entries(typeChannels).length
        ? `\nPer-type channels: ${Object.entries(typeChannels).map(([type, id]) => `\`${type}\` → <#${id}>`).join(', ')}`
        : '';
      return `Account delivery is currently set to **${current}**.${channelText}${typeText}\n` +
        `Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, \`${PREFIX}settings both #channel\`, \`${PREFIX}settings type <account type> #channel\`, or \`${PREFIX}settings channels\`.`;
    }

    if (choice === 'channels') {
      const typeChannels = getDeliveryChannelsByType(message.guildId);
      const lines = ACCOUNT_TYPES.map((type) =>
        `**${type}** → ${typeChannels[type] ? `<#${typeChannels[type]}>` : (currentChannel ? `<#${currentChannel}>` : 'not configured')}`);
      return `📚 **Type-to-channel mappings**\n${lines.join('\n')}\n\nDelivery mode: **${current}**`;
    }

    if (choice === 'clear-type') {
      const type = args.slice(1).join(' ').trim();
      if (!ACCOUNT_TYPES.includes(type)) {
        return `❌ Invalid account type. Available: ${ACCOUNT_TYPES.map((item) => `\`${item}\``).join(', ')}`;
      }
      setDeliveryChannelForType(message.guildId, type, null);
      return `✅ Cleared the dedicated channel for **${type}**. It will use the default channel again.`;
    }

    if (choice === 'create-channels') {
      if (!message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return '❌ I need **Manage Channels** to create the generated-account channels.';
      }
      const names = new Map([
        ['alt', 'generated-alt'],
        ['dump', 'generated-dump'],
        ['+1 year old', 'generated-1-year'],
        ['5+ years old', 'generated-5-years'],
      ]);
      const created = [];
      for (const [type, name] of names) {
        let channel = message.guild.channels.cache.find((item) => item.name === name && item.type === ChannelType.GuildText);
        if (!channel) {
          channel = await message.guild.channels.create({
            name,
            type: ChannelType.GuildText,
            reason: 'BloxGen account delivery setup',
          });
        }
        setDeliveryChannelForType(message.guildId, type, channel.id);
        created.push(`<#${channel.id}>`);
      }
      return `✅ Generated-account channels are ready: ${created.join(', ')}`;
    }

    if (choice === 'type' || choice === 'type-route') {
      const selectedChannel = message.mentions?.channels?.first?.();
      const fallbackChannel = message.channel?.isTextBased?.() ? message.channel : null;
      const channel = selectedChannel ||
        (args[2] && message.guild.channels.cache.get(args[2])) ||
        (choice === 'type-route' && args[2] ? await message.guild.channels.fetch(args[2]).catch(() => null) : null);
      const type = choice === 'type-route'
        ? args[1]
        : args.slice(1)
          .filter((arg) => arg !== channel?.id && !/^<#\d+>$/.test(arg))
          .join(' ')
          .trim();

      if (!ACCOUNT_TYPES.includes(type)) {
        return `❌ Invalid account type. Available: ${ACCOUNT_TYPES.map((item) => `\`${item}\``).join(', ')}`;
      }
      if (!channel?.id && !fallbackChannel?.id) {
        return `❌ Select a channel. Use \`${PREFIX}settings type <account type> #channel\`.`;
      }
      const channelId = channel?.id || fallbackChannel.id;
      setDeliveryChannelForType(message.guildId, type, channelId);
      return `✅ **${type}** accounts will now be posted in <#${channelId}> when channel delivery is enabled.`;
    }

    const map = {
      dm: 'dm',
      private: 'dm',
      server: 'server',
      channel: 'server',
      public: 'server',
      both: 'both',
      dual: 'both',
    };
    const mode = map[choice];
    if (!mode) {
      return `❌ Unknown option. Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, \`${PREFIX}settings both #channel\`, \`${PREFIX}settings channels\`, or \`${PREFIX}settings create-channels\`.`;
    }

    const selectedChannel = message.mentions?.channels?.first?.();
    const fallbackChannel = message.channel?.isTextBased?.() ? message.channel : null;
    const channel = selectedChannel || (args[1] && message.guild.channels.cache.get(args[1])) || fallbackChannel;
    const channelId = channel?.id || currentChannel;

    if ((mode === 'server' || mode === 'both') && !channelId) {
      return `❌ Select a text channel. Use \`${PREFIX}settings ${mode} #channel\`.`;
    }

    setDelivery(message.guildId, mode, channelId);
    const channelText = channelId ? `<#${channelId}>` : 'the selected channel';
    if (mode === 'server') {
      return `✅ Generated accounts will now be **posted in ${channelText}**.\n⚠️ Anyone who can read the channel will see the credentials and cookie.`;
    }
    if (mode === 'both') {
      return `✅ Every generated account will be sent to your **DMs** and posted in **${channelText}**.\n⚠️ Anyone who can read the channel will see the credentials and cookie.`;
    }
    return '✅ Generated accounts will now be **sent privately via DM**.';
  },
};
