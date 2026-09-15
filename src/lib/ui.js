// Reusable embeds and message components.
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { COLORS } from '../config.js';
import {
  AUTO_GENERATION_TYPES,
  getAutoGenerationInterval,
  getAutoGenerationStatus,
  getAutoGenerationTypes,
} from './auto-generation.js';
import { getDailyStats } from './statistics.js';
import { getPendingDeliveryCount } from './delivery-queue.js';
import { getBotTitle, getDeliveryChannel, getHealthChannel, getNewPasswordChannel } from './settings.js';
import { getHistoryCounts } from './account-history.js';
import {
  AUTO_PASSWORD_TYPES,
  getAutoPasswordSummary,
  getAutoPasswordTypeLabel,
} from './auto-password.js';

// Embed shown for a generated account. `voice` (optional) comes from the Roblox
// voice settings API: { enabled, verified } or null if the lookup failed.
export function buildAccountEmbed(acc, voice, {
  guildId = null,
  includeCredentials = false,
  destination = null,
  status = '✅ Account generated successfully. Combo is ready.',
  title = null,
  titleSuffix = null,
} = {}) {
  const hasValue = (value) => {
    if (value === undefined || value === null || value === '') return false;
    return !['unknown', 'n/a', 'null', 'undefined'].includes(String(value).trim().toLowerCase());
  };
  const valueOf = (...keys) => {
    for (const key of keys) {
      if (hasValue(acc[key])) return acc[key];
    }
    return null;
  };
  const show = (value, fallback = '—') => {
    if (!hasValue(value)) return fallback;
    return String(value)
      .replaceAll('\r', ' ')
      .replaceAll('\n', ' ')
      .replaceAll('`', 'ˋ')
      .slice(0, 900);
  };
  const showBoolean = (value) => {
    return value === true || value === 'true' ? '✅ Yes' : '❌ No';
  };
  const formatDate = (value) => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return show(value);
    return new Date(timestamp).toISOString().slice(0, 10);
  };
  const userId = valueOf('id', 'userId', 'userid');
  const displayName = valueOf('displayName', 'display_name') ?? acc.username;
  const createdAt = valueOf('accountCreatedAt', 'account_created_at', 'createdAt', 'created_at');
  const age = valueOf('estimated_age', 'estimatedAge');
  const inventory = valueOf('inventory', 'inventoryItems', 'inventory_items');
  const combo = `${acc.username ?? '—'}:${acc.password ?? '—'}`;
  const safeTitle = title || getBotTitle(guildId || acc.guildId);
  const fullTitle = titleSuffix ? `${titleSuffix} ${safeTitle}` : safeTitle;
  const embed = new EmbedBuilder()
    .setTitle(fullTitle)
    .setColor(COLORS.success)
    .setDescription(status)
    .setTimestamp();
  if (acc.avatarUrl) embed.setThumbnail(acc.avatarUrl);
  embed.addFields(
    { name: '👤 Username', value: show(acc.username), inline: true },
    { name: '🔑 Password', value: show(acc.password), inline: true },
    { name: '🆔 User ID', value: show(userId), inline: true },
    { name: '📛 Display Name', value: show(displayName), inline: true },
    { name: '📅 Account Created', value: formatDate(createdAt), inline: true },
    { name: '🌎 Region', value: show(acc.region), inline: true },
    { name: '📧 Email Verified', value: hasValue(acc.email_verified) ? showBoolean(acc.email_verified) : '—', inline: true },
    { name: '🔞 Age Verified', value: hasValue(acc.age_verified) ? showBoolean(acc.age_verified) : '—', inline: true },
    { name: '🎂 Estimated Age', value: show(age), inline: true },
    { name: '🎒 Inventory', value: show(
      Array.isArray(inventory)
        ? inventory.join(', ')
        : inventory && typeof inventory === 'object' ? JSON.stringify(inventory) : inventory,
    ), inline: false },
    { name: '🔗 Combo', value: `\`${combo}\``, inline: false },
  );
  if (voice) {
    embed.addFields({
      name: '🎙️ Voice Chat',
      value: voice.enabled ? `✅ Enabled${voice.verified ? ' · verified' : ''}` : '❌ Disabled',
      inline: true,
    });
  }
  for (const [name, value] of [
    ['💰 Cost', acc.cost == null ? null : `$${acc.cost}`],
    ['💎 Robux', acc.robux],
    ['📊 RAP', acc.rap],
    ['📝 Summary', acc.summary],
  ]) {
    if (hasValue(value)) embed.addFields({ name, value: show(value), inline: true });
  }
  if (destination) {
    embed.addFields({ name: 'Destination', value: destination, inline: true });
  }
  return embed;
}

export function buildAccountFile(acc) {
  if (!acc.cookie) return null;
  const contents = [
    `username: ${acc.username ?? ''}`,
    `password: ${acc.password ?? ''}`,
    `cookie: ${acc.cookie}`,
  ].join('\n');
  return new AttachmentBuilder(Buffer.from(contents, 'utf8'), {
    name: `bloxgen-${String(acc.username || 'account').replace(/[^a-z0-9_-]/gi, '_')}.txt`,
  });
}

export function buildAccountPayload(acc, {
  ownerId,
  guildId = null,
  includeCredentials = false,
  voice = null,
  destination = null,
  status,
  title = null,
  titleSuffix = null,
  includeGenerateAgain = true,
} = {}) {
  const file = includeCredentials ? buildAccountFile(acc) : null;
  return {
    embeds: [buildAccountEmbed(acc, voice, {
      includeCredentials,
      destination,
      status,
      title,
      titleSuffix,
      guildId,
    })],
    components: [accountActionsRow(acc.type, acc.username, ownerId, { includeGenerateAgain })],
    ...(file ? { files: [file] } : {}),
  };
}

// A "Generate again" button that regenerates the same type.
export function generateAgainRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gen-again:${type}`)
      .setLabel('Generate again')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function accountActionsRow(type, username, ownerId, { includeGenerateAgain = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    ...(includeGenerateAgain ? [
      new ButtonBuilder()
        .setCustomId(`gen-again:${type}`)
        .setLabel('Generate again')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ] : []),
  );

  if (username && ownerId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`account-login:${ownerId}:${encodeURIComponent(username)}`)
        .setLabel('Show login')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary),
    );
    row.addComponents(passwordChangeButton(username, ownerId));
  }
  if (username) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`copy-combo:${encodeURIComponent(username)}`)
        .setLabel('Copy Combo')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Success),
    );
  }
  return row;
}

function passwordChangeButton(username, ownerId) {
  return new ButtonBuilder()
    .setCustomId(`password-change:${ownerId}:${encodeURIComponent(username)}`)
    .setLabel('Change password')
    .setEmoji('🔐')
    .setStyle(ButtonStyle.Secondary);
}

export function passwordChangeRow(username, ownerId) {
  return new ActionRowBuilder().addComponents(passwordChangeButton(username, ownerId));
}

export function buildPasswordProcessingPayload(username, guildId) {
  const embed = new EmbedBuilder()
    .setTitle(`🔐 ${getBotTitle(guildId)} — Changing Password`)
    .setColor(COLORS.brand)
    .setDescription('🔄 Changing Password')
    .addFields(
      { name: 'Username', value: `\`${username}\``, inline: true },
      { name: 'Status', value: 'Processing...', inline: true },
    );
  return { embeds: [embed] };
}

export function buildPasswordChangePayload(account, { ownerId, guildId, destination = null } = {}) {
  return buildAccountPayload(account, {
    ownerId,
    guildId,
    destination,
    title: `${getBotTitle(guildId)} — Password Changed`,
    titleSuffix: '🔐',
    status: '✅ Password changed successfully. Combo is ready.',
    includeGenerateAgain: false,
  });
}

// The dropdown panel to pick an account type.
export function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle('🧬 Generate an account')
    .setDescription('Pick an account type from the menu below.\nYour account will be sent to your DMs.');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('gen-select')
    .setPlaceholder('Choose an account type…')
    .addOptions(ACCOUNT_TYPES.map((t) => ({ label: t, value: t })));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

export function buildSettingsPanel(guildId) {
  const counts = getHistoryCounts();
  const autoSummary = getAutoPasswordSummary(guildId);
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Kazu Bot Settings')
    .setColor(COLORS.brand)
    .addFields(
      { name: 'Title', value: getBotTitle(guildId), inline: false },
      { name: 'Generator Channel', value: getDeliveryChannel(guildId) ? `<#${getDeliveryChannel(guildId)}>` : 'DM / not set', inline: true },
      { name: 'New Password Channel', value: getNewPasswordChannel(guildId) ? `<#${getNewPasswordChannel(guildId)}>` : 'Not set', inline: true },
      { name: 'Health Channel', value: getHealthChannel(guildId) ? `<#${getHealthChannel(guildId)}>` : 'Not set', inline: true },
      { name: 'Generated', value: String(autoSummary.totals.generated || counts.generated), inline: true },
      { name: 'Changed', value: String(autoSummary.totals.changed || counts.changed), inline: true },
      { name: 'Failed', value: String(autoSummary.totals.failed), inline: true },
      { name: 'Unknown', value: String(autoSummary.totals.unknown), inline: true },
    );

  const select = (customId, placeholder) => new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('settings-title')
      .setLabel('Change Title')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('settings-export-generated')
      .setLabel('Export Generated')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('settings-export-changed')
      .setLabel('Export New Passwords')
      .setEmoji('🔐')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('settings-clear-history')
      .setLabel('Clear History')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );
  return {
    embeds: [embed],
    components: [
      select('settings-generator-channel', 'Change Generator Channel'),
      select('settings-password-channel', 'Change Password Channel'),
      select('settings-health-channel', 'Change Health Channel'),
      actions,
    ],
  };
}

function autoPasswordChannelLines(summary) {
  if (!summary.channels.length) return 'No Auto Password channels enabled.';
  return summary.channels.map((channel) => {
    const state = channel.paused ? '⏸️ Paused' : '🟢 Enabled';
    const counts = channel.counters;
    return `<#${channel.channelId}>\n${state} | ${channel.typeLabel}\n` +
      `Generated: ${counts.generated} | Changed: ${counts.changed}\n` +
      `Failed: ${counts.failed} | Unknown: ${counts.unknown}`;
  }).join('\n\n').slice(0, 3900);
}

export function buildAutoPasswordPanel(guildId) {
  const summary = getAutoPasswordSummary(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🤖 Kazu Bot — Auto Password')
    .setColor(summary.channels.length ? COLORS.success : COLORS.brand)
    .addFields(
      { name: '📊 Channels', value: autoPasswordChannelLines(summary), inline: false },
      {
        name: '━━━━━━━━━━━━━━',
        value: `Total Generated: ${summary.totals.generated}\n` +
          `Total Changed: ${summary.totals.changed}\n` +
          `Total Failed: ${summary.totals.failed}\n` +
          `Total Unknown: ${summary.totals.unknown}`,
        inline: false,
      },
    );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('autopass-enable')
          .setLabel('Enable')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('autopass-manage')
          .setLabel('Manage')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('autopass-refresh')
          .setLabel('Refresh')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

export function buildAutoPasswordEnablePanel(channelId = null, mode = 'enable') {
  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId(`${mode === 'edit' ? 'autopass-edit-type' : 'autopass-enable-type'}:${channelId || 'none'}`)
    .setPlaceholder(channelId ? 'Select account type…' : 'Select a channel first')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!channelId)
    .addOptions(AUTO_PASSWORD_TYPES.map((item) => ({
      label: item.label,
      value: item.id,
    })));
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🤖 Kazu Bot — Enable Auto Password')
        .setColor(COLORS.brand)
        .setDescription(channelId
          ? `Channel: <#${channelId}>\nChoose the exact account type to route here.`
          : 'Select the input channel first. Credentials are deleted after validation.'),
    ],
    components: [
      ...(mode === 'edit' ? [] : [new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('autopass-enable-channel')
          .setPlaceholder('Select Auto Password input channel')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1),
      )]),
      new ActionRowBuilder().addComponents(typeMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('autopass-back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export function buildAutoPasswordManagePanel(guildId) {
  const summary = getAutoPasswordSummary(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🤖 Kazu Bot — Manage Auto Password')
    .setColor(COLORS.brand)
    .setDescription(summary.channels.length
      ? 'Each row changes only its own channel. Queued work remains saved while paused.'
      : 'No Auto Password channels are enabled.')
    .addFields({
      name: 'Totals',
      value: `Generated ${summary.totals.generated} · Changed ${summary.totals.changed} · ` +
        `Failed ${summary.totals.failed} · Unknown ${summary.totals.unknown}`,
    });
  const rows = summary.channels.slice(0, 4).map((channel) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${channel.paused ? 'autopass-resume' : 'autopass-pause'}:${channel.channelId}`)
        .setLabel(channel.paused ? 'Resume' : 'Pause')
        .setEmoji(channel.paused ? '▶️' : '⏸️')
        .setStyle(channel.paused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`autopass-edit:${channel.channelId}`)
        .setLabel('Edit')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`autopass-remove:${channel.channelId}`)
        .setLabel('Remove')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`autopass-export:${channel.channelId}`)
        .setLabel('Export')
        .setEmoji('📄')
        .setStyle(ButtonStyle.Primary),
    ),
  );
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('autopass-channels')
      .setLabel('Channels')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('autopass-back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [embed], components: rows };
}

function formatDuration(ms) {
  if (ms < 60000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour${minutes === 60 ? '' : 's'}`;
  return `${minutes} minutes`;
}

export function buildAutoGenerationPanel(guildId) {
  const status = getAutoGenerationStatus(guildId);
  const selected = getAutoGenerationTypes(guildId);
  const dailyStats = getDailyStats(guildId);
  const safeError = status.lastError
    ? String(status.lastError).replaceAll('`', 'ˋ').replaceAll('\n', ' ').slice(0, 300)
    : null;
  const statusText = status.enabled
    ? status.waitingReason
      ? `Enabled. ${status.waitingReason}`
      : 'Enabled. Auto-generation will continue until an admin presses **Disable**.'
    : 'Disabled. Nothing will be generated until an admin presses **Enable**.';

  const embed = new EmbedBuilder()
    .setColor(status.enabled ? COLORS.success : COLORS.brand)
    .setTitle('Auto-generation')
    .setDescription(
      `${statusText}\n\n` +
       `Generates immediately, then one account every **${formatDuration(getAutoGenerationInterval(guildId))}** until disabled.\n` +
      'Before each cycle, the bot refreshes stock and daily limits, skips unavailable or limited categories, then checks again on the next cycle.\n' +
       'The personal API key belongs to the admin who enabled this run. Accounts follow the server’s current DM, channel, or DM + channel delivery setting.' +
       (safeError ? `\n\n⚠️ **Last error:** ${safeError}` : ''),
    )
    .addFields({
      name: 'Selected categories',
      value: status.types.map((type) => `\`${type}\``).join(' · '),
      inline: true,
    });

  if (status.enabled) {
    embed.addFields(
      {
        name: '📊 Run totals',
        value: `Generated: **${status.generatedCount}**\nSkipped/checks: **${status.skippedCount}**\nAttempts: **${status.attemptCount}**\nRetry queue: **${status.pendingDeliveries ?? 0}**`,
        inline: true,
      },
      {
        name: '🔄 Automatic checks',
         value: `Stock: **${status.stockAvailableCount === null ? 'not checked' : `${status.stockAvailableCount}/${status.selectedTypeCount}`}** selected in stock\nDaily remaining: **${status.remainingGenerations ?? 'not checked'}**\nLimit-blocked: **${status.limitBlockedTypes?.length ? status.limitBlockedTypes.join(', ') : 'none'}**\nCooldown-skipped: **${status.cooldownTypes?.length ? status.cooldownTypes.join(', ') : 'none'}**\nLast refresh: ${status.lastStockCheckAt ? `<t:${Math.floor(status.lastStockCheckAt / 1000)}:R>` : '—'}`,
        inline: true,
      },
      {
        name: '🔎 Last activity',
        value: `Last type: **${status.lastType || '—'}**\nLast stock check: ${status.lastStockCheckAt ? `<t:${Math.floor(status.lastStockCheckAt / 1000)}:R>` : '—'}\nLast limit check: ${status.lastLimitCheckAt ? `<t:${Math.floor(status.lastLimitCheckAt / 1000)}:R>` : '—'}`,
        inline: true,
      },
    );
  }

  const typeLines = (status.typeStatuses ?? status.types.map((type) => ({
    type,
    icon: '⚪',
    label: 'Waiting',
    reason: 'Not checked yet',
  }))).map((item) => {
    const count = status.generatedByType?.[item.type] ?? dailyStats.byType?.[item.type]?.generated ?? 0;
    return `${item.icon} **${item.type}** — ${item.label}${item.reason ? ` · ${item.reason}` : ''} · **${count} generated**`;
  });
  embed.addFields({
    name: '📦 Per-type status & counters',
    value: typeLines.join('\n').slice(0, 1024) || 'No account types selected.',
    inline: false,
  });
  const mostUsed = Object.entries(dailyStats.byType ?? {})
    .sort(([, left], [, right]) => (right.generated ?? 0) - (left.generated ?? 0))[0]?.[0] ?? '—';
  const mostSuccessfulChannel = Object.entries(dailyStats.byChannel ?? {})
    .sort(([, left], [, right]) => right - left)[0]?.[0];
  embed.addFields({
    name: '📈 Today',
    value: `Generated: **${dailyStats.generated}** · Successful: **${dailyStats.successful}** · Skipped: **${dailyStats.skipped}** · Failed: **${dailyStats.failed}**\nMost used type: **${mostUsed}** · Most successful channel: ${mostSuccessfulChannel ? `<#${mostSuccessfulChannel}>` : '—'}`,
    inline: false,
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('autogen-types')
    .setPlaceholder('Select one or more account categories…')
    .setMinValues(1)
    .setMaxValues(AUTO_GENERATION_TYPES.length)
    .setDisabled(status.enabled)
    .addOptions(
      AUTO_GENERATION_TYPES.map((type) => ({
        label: type,
        value: type,
        default: selected.includes(type),
      })),
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('autogen-enable')
      .setLabel('Enable')
      .setStyle(ButtonStyle.Success)
      .setDisabled(status.enabled),
    new ButtonBuilder()
      .setCustomId('autogen-disable')
      .setLabel('Disable')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!status.enabled),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      buttons,
    ],
  };
}
