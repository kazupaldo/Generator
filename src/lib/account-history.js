// Durable, encrypted exports for generated accounts and successful password changes.
// The two collections intentionally stay separate so an export can never mix them.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AttachmentBuilder } from 'discord.js';
import { ROOT, SESSION_SECRET } from '../config.js';

const FILE = join(ROOT, 'account-history.json');
const KEY = SESSION_SECRET ? createHash('sha256').update(SESSION_SECRET).digest() : null;

let cache = { generated: {}, changed: {} };
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  // First run.
}
cache.generated ??= {};
cache.changed ??= {};

function requireKey() {
  if (!KEY) throw new Error('SESSION_SECRET is required to persist account history securely.');
}

function encrypt(value) {
  requireKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(record) {
  requireKey();
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
}

function save() {
  requireKey();
  const temporary = `${FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(cache, null, 2), { mode: 0o600 });
  renameSync(temporary, FILE);
}

function keyFor(username) {
  return String(username ?? '').trim().toLowerCase();
}

function readCollection(collection) {
  return Object.values(cache[collection] ?? {})
    .map((record) => {
      try {
        return decrypt(record);
      } catch (error) {
        console.error(`Could not decrypt ${collection} history entry:`, error.message);
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.timestamp ?? right.generatedAt ?? '').localeCompare(
      String(left.timestamp ?? left.generatedAt ?? ''),
    ));
}

export function recordGeneratedAccount(account) {
  if (!account?.username || !account?.password) return false;
  const username = String(account.username);
  cache.generated[keyFor(username)] = encrypt(JSON.stringify({
    username,
    password: String(account.password),
    combo: `${username}:${account.password}`,
    type: account.type ?? null,
    generatedAt: account.generatedAt ?? new Date().toISOString(),
  }));
  save();
  return true;
}

export function recordPasswordChange(account, timestamp = new Date().toISOString()) {
  if (!account?.username || !account?.password) return false;
  const username = String(account.username);
  cache.changed[keyFor(username)] = encrypt(JSON.stringify({
    username,
    password: String(account.password),
    combo: `${username}:${account.password}`,
    timestamp,
  }));
  save();
  return true;
}

export function getGeneratedAccounts() {
  return readCollection('generated');
}

export function getPasswordChanges() {
  return readCollection('changed');
}

export function getHistoryCounts() {
  return {
    generated: Object.keys(cache.generated ?? {}).length,
    changed: Object.keys(cache.changed ?? {}).length,
  };
}

export function clearAccountHistory() {
  cache.generated = {};
  cache.changed = {};
  save();
}

export function buildHistoryExport(kind) {
  const accounts = kind === 'changed' ? getPasswordChanges() : getGeneratedAccounts();
  const content = accounts
    .filter((account) => account.username && account.password)
    .map((account) => `${account.username}:${account.password}`)
    .join('\n');
  return {
    accounts,
    file: new AttachmentBuilder(Buffer.from(`${content}${content ? '\n' : ''}`, 'utf8'), {
      name: kind === 'changed' ? 'kazu-new-passwords.txt' : 'kazu-generated-accounts.txt',
    }),
  };
}