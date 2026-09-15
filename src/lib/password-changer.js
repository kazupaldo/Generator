import { randomBytes } from 'node:crypto';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { COLORS, PREFIX } from '../config.js';
import { findAccountByUsername } from '../bloxgen-dashboard.js';
import { changePassword, verifyPasswordChange } from '../roblox.js';
import { getUpdatedAccount, setUpdatedAccount } from './account-credentials.js';
import { getNewPasswordChannel } from './settings.js';
import {
  getGeneratedAccounts,
  getPasswordChanges,
  recordPasswordChange,
} from './account-history.js';

export const MAX_PASSWORD_CHANGE_TARGETS = 10;
const PASSWORD_CHANGE_DELAY_MS = 1_200;
const PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_DIGITS = '23456789';

export const PASSWORD_CHANGE_TYPES = [
  { id: 'alts', label: 'Alts', values: ['alt', 'alts'] },
  { id: '30d', label: '30+ Days', values: ['+30 days old', '30+ days', '30d', '30 days'] },
  { id: '1y', label: '1 Year+', values: ['+1 year old', '1 year+', '1y', '1 year'] },
  { id: '5y', label: '5 Years+', values: ['5+ years old', '5 years+', '5y', '5 years'] },
  { id: 'dump', label: 'Dump', values: ['dump'] },
  { id: '18plus', label: '18+ Age Verified', values: ['18+ age verified', '18+', '18plus'] },
];

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function safe(value, fallback = '—') {
  const text = String(value ?? '')
    .replaceAll('`', 'ˋ')
    .replaceAll('\n', ' ')
    .trim();
  return text ? text.slice(0, 900) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPassword() {
  const bytes = randomBytes(4);
  return `KazuShop${PASSWORD_DIGITS[bytes[0] % PASSWORD_DIGITS.length]}`
    + `${PASSWORD_LETTERS[bytes[1] % PASSWORD_LETTERS.length]}`
    + `${PASSWORD_DIGITS[bytes[2] % PASSWORD_DIGITS.length]}`
    + PASSWORD_LETTERS[bytes[3] % PASSWORD_LETTERS.length];
}

export function parsePasswordChangeTargets(args = []) {
  const raw = args.join(' ').trim();
  if (!raw) {
    return {
      targets: [],
      error: `Usage: \`${PREFIX}passwordchanger <generated-username[,username...]>\``,
    };
  }

  // This command deliberately never accepts passwords, combos, cookies, or
  // uploaded files. It resolves usernames from the bot's own encrypted history.
  if (raw.includes(':') || raw.includes('/') || raw.includes('\\')) {
    return {
      targets: [],
      error: '❌ This command accepts generated usernames only; raw `user:pass`, cookies, and TXT files are not accepted.',
    };
  }

  const input = raw.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  const targets = [];
  const seen = new Set();
  let invalid = 0;
  for (const username of input) {
    const key = normalize(username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username) || seen.has(key)) {
      invalid++;
      continue;
    }
    seen.add(key);
    targets.push(username);
  }

  if (targets.length > MAX_PASSWORD_CHANGE_TARGETS) {
    return {
      targets: [],
      error: `❌ You can process at most ${MAX_PASSWORD_CHANGE_TARGETS} bot-issued accounts per command.`,
    };
  }
  if (!targets.length) {
    return { targets: [], error: '❌ No valid generated usernames were supplied.' };
  }
  return { targets, invalid };
}

export function normalizePasswordChangeType(value) {
  const input = normalize(value);
  return PASSWORD_CHANGE_TYPES.find((type) =>
    type.id === input
    || type.label.toLowerCase() === input
    || type.values.some((alias) => alias.toLowerCase() === input),
  )?.id ?? null;
}

export function getPasswordChangeTypeLabel(typeId) {
  return PASSWORD_CHANGE_TYPES.find((type) => type.id === typeId)?.label ?? typeId;
}

export function parsePasswordChangeRequest(args = []) {
  const first = normalize(args[0]);
  if (first === 'type' || first.startsWith('type=')) {
    const rawType = first.startsWith('type=')
      ? args[0].slice(args[0].indexOf('=') + 1)
      : args.slice(1).join(' ');
    const type = normalizePasswordChangeType(rawType);
    if (!type) {
      return {
        targets: [],
        type: null,
        error: `❌ Choose a valid type: ${PASSWORD_CHANGE_TYPES.map((item) => `\`${item.label}\``).join(', ')}.`,
      };
    }
    return { targets: [], type };
  }
  return { ...parsePasswordChangeTargets(args), type: null };
}

function historyAccount(username, generated, changed) {
  const key = normalize(username);
  return [...changed, ...generated].find((account) => normalize(account.username) === key) ?? null;
}

export function listOwnedUsernamesByType(typeId) {
  const generated = getGeneratedAccounts();
  const changed = getPasswordChanges();
  const filter = PASSWORD_CHANGE_TYPES.find((type) => type.id === typeId);
  if (!filter) return [];
  const unique = new Map();
  for (const account of [...changed, ...generated]) {
    const accountType = normalize(account.type);
    if (!account.username || !filter.values.some((value) => normalize(value) === accountType)) continue;
    unique.set(normalize(account.username), account.username);
  }
  return [...unique.values()];
}

async function sendBatchExport(client, guildId, results) {
  const channelId = getNewPasswordChannel(guildId);
  if (!channelId) {
    throw new Error('Configure a private New Password Channel before running Password Changer.');
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error('The configured New Password Channel is unavailable or is not a text channel.');
  }
  const content = results
    .map((result) => `${result.username}:${result.password}`)
    .join('\n');
  await channel.send({
    content: `📄 Password Changer completed ${results.length} account${results.length === 1 ? '' : 's'}.`,
    files: [new AttachmentBuilder(Buffer.from(`${content}\n`, 'utf8'), {
      name: 'kazu-passwordchanger-results.txt',
    })],
  });
}

function progressEmbed({ total, processing, completed, invalid, errors, last }) {
  const finished = processing === 0;
  const hasErrors = errors > 0;
  const embed = new EmbedBuilder()
    .setTitle('🔐 Kazu Bot — Password Changer')
    .setColor(finished ? (hasErrors ? 0xfee75c : COLORS.success) : COLORS.brand)
    .setDescription(finished ? '✅ Processing complete.' : '🔄 Processing authorized bot-issued accounts...')
    .addFields(
      { name: 'Total', value: String(total), inline: true },
      { name: 'Processing', value: String(processing), inline: true },
      { name: 'Completed', value: String(completed), inline: true },
      { name: 'Invalid', value: String(invalid), inline: true },
      { name: 'Error', value: String(errors), inline: true },
    )
    .setTimestamp();
  if (last) {
    embed.addFields({
      name: last.error ? 'Last result' : 'Last account',
      value: `\`${safe(last.username)}\` — ${safe(last.error || last.status)}`,
      inline: false,
    });
  }
  return embed;
}

export function buildPasswordChangerProgress(targets, invalid = 0) {
  return buildPasswordChangerProgressPayload({
    total: targets.length + invalid,
    processing: targets.length ? targets.length : 0,
    completed: 0,
    invalid,
    errors: 0,
    last: null,
  });
}

export function buildPasswordChangerProgressPayload(stats) {
  return { embeds: [progressEmbed(stats)] };
}

export async function runPasswordChangeBatch({
  client,
  guildId,
  requester,
  targets,
  initialInvalid = 0,
  onProgress = async () => {},
}) {
  const generated = getGeneratedAccounts();
  const changed = getPasswordChanges();
  const counts = {
    total: targets.length + initialInvalid,
    processing: targets.length,
    completed: 0,
    invalid: initialInvalid,
    errors: 0,
    results: [],
  };
  let last = null;

  const update = () => onProgress({ ...counts, last });
  await update();

  for (let index = 0; index < targets.length; index++) {
    const username = targets[index];
    if (index > 0) await sleep(PASSWORD_CHANGE_DELAY_MS);

    try {
      const local = getUpdatedAccount(username) ?? historyAccount(username, generated, changed);
      if (!local) {
        counts.invalid++;
        last = { username, status: 'Not found in bot history' };
        continue;
      }

      const remote = local.cookie ? null : await findAccountByUsername(username);
      const account = { ...(remote ?? {}), ...local };
      if (!account.cookie || !account.password) {
        counts.invalid++;
        last = { username, status: 'Missing authorized account session' };
        continue;
      }

      const newPassword = createPassword();
      await changePassword({
        cookie: account.cookie,
        currentPassword: account.password,
        newPassword,
      });
      if (!await verifyPasswordChange(account.cookie)) {
        throw new Error('Roblox did not confirm the authenticated session after the change.');
      }

      const updatedAccount = {
        ...account,
        password: newPassword,
        passwordChangeStatus: 'Changed and verified by Password Changer',
      };
      setUpdatedAccount(updatedAccount);
      recordPasswordChange(updatedAccount);
      counts.results.push({
        username: updatedAccount.username,
        password: newPassword,
      });

      counts.completed++;
      last = { username, status: 'Password changed; queued for the private TXT export.' };
    } catch (error) {
      counts.errors++;
      last = { username, error: error.message || 'Roblox password change failed.' };
    } finally {
      counts.processing--;
      await update();
    }
  }

  if (counts.results.length) {
    try {
      await sendBatchExport(client, guildId, counts.results);
    } catch (error) {
      last = {
        username: 'TXT export',
        error: `Passwords changed, but the private TXT export could not be delivered: ${error.message}`,
      };
    }
  }

  return { ...counts, last };
}