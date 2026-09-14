import { randomBytes } from 'node:crypto';
import { changePassword } from '../roblox.js';
import { getAutoPasswordConfig } from './settings.js';
import { setUpdatedAccount } from './account-credentials.js';

const PASSWORD_PREFIX = 'KazuShop';
const PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_DIGITS = '23456789';

export function createRandomPassword() {
  // Keep the requested mobile-friendly format, for example: KazuShop8H3G.
  const bytes = randomBytes(4);
  const suffix = [
    PASSWORD_DIGITS[bytes[0] % PASSWORD_DIGITS.length],
    PASSWORD_LETTERS[bytes[1] % PASSWORD_LETTERS.length],
    PASSWORD_DIGITS[bytes[2] % PASSWORD_DIGITS.length],
    PASSWORD_LETTERS[bytes[3] % PASSWORD_LETTERS.length],
  ].join('');
  return `${PASSWORD_PREFIX}${suffix}`;
}

function normalizeType(type) {
  return String(type ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isAutoPasswordEnabledForType(guildId, type) {
  const config = getAutoPasswordConfig(guildId);
  const normalizedType = normalizeType(type);
  return Boolean(
    config.enabled &&
    (!config.types?.length || config.types.some((item) => normalizeType(item) === normalizedType)),
  );
}

export function getAutoPasswordStatus(guildId) {
  const config = getAutoPasswordConfig(guildId);
  return {
    ...config,
    types: config.types?.length ? [...config.types] : [],
    scope: config.types?.length ? config.types.join(', ') : 'all account types',
  };
}

export async function applyAutomaticPasswordChange({ guildId, type, account }) {
  if (!isAutoPasswordEnabledForType(guildId, type)) {
    return { account, changed: false, error: null };
  }

  if (!account?.cookie || !account?.password) {
    return {
      account,
      changed: false,
      error: 'The generated account did not include both a password and a session cookie.',
    };
  }

  const newPassword = createRandomPassword();
  try {
    await changePassword({
      cookie: account.cookie,
      currentPassword: account.password,
      newPassword,
    });
    const updatedAccount = {
      ...account,
      password: newPassword,
      passwordChangeStatus: 'Automatically changed',
    };
    try {
      setUpdatedAccount(updatedAccount);
    } catch (storageError) {
      return {
        account: {
          ...updatedAccount,
          passwordChangeStatus: `Automatically changed; secure history sync failed: ${storageError.message}`,
        },
        changed: true,
        error: storageError.message,
      };
    }
    return { account: updatedAccount, changed: true, error: null };
  } catch (error) {
    return {
      account: {
        ...account,
        passwordChangeStatus: `Automatic change failed: ${error.message}`,
      },
      changed: false,
      error: error.message,
    };
  }
}

export async function sendAutoPasswordNotice(client, { guildId, type, account, ownerId }) {
  const config = getAutoPasswordConfig(guildId);
  if (!config.enabled || !config.channelId) return;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send(
    `🔐 Password automatically changed for \`${account.username}\` (**${type}**). ` +
    `The new username and password were sent privately to <@${ownerId}>.`,
  ).catch((error) => console.error('Could not send automatic password notice:', error.message));
}