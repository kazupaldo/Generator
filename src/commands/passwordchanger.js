import { PermissionFlagsBits } from 'discord.js';
import { PREFIX, SESSION_SECRET } from '../config.js';
import { getNewPasswordChannel } from '../lib/settings.js';
import {
  buildPasswordChangerProgress,
  buildPasswordChangerProgressPayload,
  getPasswordChangeTypeLabel,
  listOwnedUsernamesByType,
  parsePasswordChangeRequest,
  runPasswordChangeBatch,
} from '../lib/password-changer.js';

export default {
  name: 'passwordchanger',
  aliases: ['passwordchange', 'password-change', 'pchange'],
  async execute({ message, args, client, interaction }) {
    if (!message.guild) return 'This command can only be used in a server.';
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to use Password Changer.';
    }
    if (!SESSION_SECRET) {
      return '❌ SESSION_SECRET is required so account history and updated credentials stay encrypted.';
    }
    if (!getNewPasswordChannel(message.guildId)) {
      return '❌ Configure a private **New Password Channel** in `+settings` before running Password Changer.';
    }

    const parsed = parsePasswordChangeRequest(args);
    if (parsed.error) return parsed.error;
    let targets = parsed.targets;
    if (parsed.type) {
      targets = listOwnedUsernamesByType(parsed.type);
      if (!targets.length) {
        return `📭 No bot-issued accounts with the **${getPasswordChangeTypeLabel(parsed.type)}** type were found.`;
      }
      if (targets.length > 10) {
        return `❌ The **${getPasswordChangeTypeLabel(parsed.type)}** filter matched ${targets.length} accounts. The limit is 10 per run; use specific usernames to choose which ones to process.`;
      }
    }

    const initialPayload = buildPasswordChangerProgress(targets, parsed.invalid);
    const progress = interaction
      ? await interaction.editReply(initialPayload)
      : await message.reply(initialPayload);
    const result = await runPasswordChangeBatch({
      client,
      guildId: message.guildId,
      requester: message.author,
      targets,
      initialInvalid: parsed.invalid,
      onProgress: async (stats) => {
        const payload = buildPasswordChangerProgressPayload(stats);
        await (interaction ? interaction.editReply(payload) : progress.edit(payload)).catch(() => {});
      },
    });
    return interaction ? buildPasswordChangerProgressPayload(result) : null;
  },
};