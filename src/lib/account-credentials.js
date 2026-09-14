// Encrypted local overrides for credentials changed after BloxGen generated an account.
// The dashboard history still contains the original password, so this store keeps
// Show login and manual password changes consistent with the account's current state.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SESSION_SECRET } from '../config.js';

const FILE = join(ROOT, 'account-credentials.json');
const KEY = SESSION_SECRET ? createHash('sha256').update(SESSION_SECRET).digest() : null;
let cache;

try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function requireKey() {
  if (!KEY) throw new Error('SESSION_SECRET is required to store changed account credentials securely.');
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
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function save() {
  const temporary = `${FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(cache, null, 2), { mode: 0o600 });
  renameSync(temporary, FILE);
}

export function setUpdatedAccount(account) {
  if (!account?.username) return;
  cache[String(account.username).toLowerCase()] = encrypt(JSON.stringify(account));
  save();
}

export function getUpdatedAccount(username) {
  const record = cache[String(username ?? '').toLowerCase()];
  if (!record) return null;
  try {
    return JSON.parse(decrypt(record));
  } catch (error) {
    console.error(`Could not decrypt updated credentials for ${username}:`, error.message);
    return null;
  }
}