import { randomBytes } from 'node:crypto';
import {
  findAutoPasswordChannelForType,
  getAutoPasswordSummary,
  isAutoPasswordEnabledForType as isManagedAutoPasswordEnabledForType,
  submitGeneratedAccount,
} from './auto-password.js';

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
  return isManagedAutoPasswordEnabledForType(guildId, type);
}

export function getAutoPasswordStatus(guildId) {
  return getAutoPasswordSummary(guildId);
}

export async function applyAutomaticPasswordChange({ client, guildId, type, account, ownerId }) {
  if (!findAutoPasswordChannelForType(guildId, type)) {
    return { account, changed: false, error: null };
  }

  return submitGeneratedAccount({ client, guildId, type, account, ownerId });
}