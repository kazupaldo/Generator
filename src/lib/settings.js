// Per-server settings, cached in memory and persisted to settings.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

const FILE = join(ROOT, 'settings.json');

// Load once at startup; reads then hit memory, writes go through to disk.
let cache;
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function update(guildId, patch) {
  cache[guildId] = { ...cache[guildId], ...patch };
  try {
    writeFileSync(FILE, JSON.stringify(cache, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err.message);
    return false;
  }
}

// Where generated accounts are sent: "dm" (default), "server", or "both".
export function getDelivery(guildId) {
  if (!guildId) return 'dm';
  return cache[guildId]?.delivery ?? 'dm';
}

// Optional channel selected for server/both delivery.
export function getDeliveryChannel(guildId) {
  if (!guildId) return null;
  return cache[guildId]?.deliveryChannel ?? null;
}

export function getDeliveryChannelForType(guildId, type) {
  if (!guildId || !type) return getDeliveryChannel(guildId);
  return cache[guildId]?.deliveryChannels?.[type] ?? getDeliveryChannel(guildId);
}

export function getDeliveryChannelsByType(guildId) {
  if (!guildId) return {};
  return { ...(cache[guildId]?.deliveryChannels ?? {}) };
}

export function setDelivery(guildId, delivery, channelId) {
  const patch = { delivery };
  if (channelId !== undefined) patch.deliveryChannel = channelId || null;
  update(guildId, patch);
}

export function setDeliveryChannelForType(guildId, type, channelId) {
  if (!guildId || !type) return;
  const deliveryChannels = { ...(cache[guildId]?.deliveryChannels ?? {}) };
  if (channelId) deliveryChannels[type] = channelId;
  else delete deliveryChannels[type];
  update(guildId, { deliveryChannels });
}

export function getAutoGenerationConfig(guildId) {
  if (!guildId) return {};
  return { ...(cache[guildId]?.autoGeneration ?? {}) };
}

export function setAutoGenerationConfig(guildId, patch) {
  if (!guildId) return;
  update(guildId, {
    autoGeneration: {
      ...(cache[guildId]?.autoGeneration ?? {}),
      ...patch,
    },
  });
}

export function getAutoPasswordConfig(guildId) {
  if (!guildId) return { enabled: false, types: [], channelId: null };
  return {
    enabled: false,
    types: [],
    channelId: null,
    ...(cache[guildId]?.autoPassword ?? {}),
  };
}

export function setAutoPasswordConfig(guildId, patch) {
  if (!guildId) return false;
  return update(guildId, {
    autoPassword: {
      ...getAutoPasswordConfig(guildId),
      ...patch,
    },
  });
}

export function getConfiguredGuildIds() {
  return Object.keys(cache);
}

// Channel ID where generations are logged for this server (null = none set).
export function getLogChannel(guildId) {
  if (!guildId) return null;
  return cache[guildId]?.logChannel ?? null;
}

// Pass null/undefined to clear the configured log channel.
export function setLogChannel(guildId, channelId) {
  update(guildId, { logChannel: channelId ?? null });
}

export function getBotTitle(guildId) {
  return cache[guildId]?.botTitle || '🤖 Kazu Bot';
}

export function setBotTitle(guildId, title) {
  const value = String(title ?? '').trim().slice(0, 80);
  return update(guildId, { botTitle: value || '🤖 Kazu Bot' });
}

export function getNewPasswordChannel(guildId) {
  return cache[guildId]?.newPasswordChannelId ??
    cache[guildId]?.autoPassword?.channelId ??
    null;
}

export function setNewPasswordChannel(guildId, channelId) {
  return update(guildId, { newPasswordChannelId: channelId ?? null });
}

export function getHealthChannel(guildId) {
  return cache[guildId]?.healthChannelId ?? null;
}

export function setHealthChannel(guildId, channelId) {
  return update(guildId, { healthChannelId: channelId ?? null, healthMessageId: null });
}

export function getHealthMessage(guildId) {
  return cache[guildId]?.healthMessageId ?? null;
}

export function setHealthMessage(guildId, messageId) {
  return update(guildId, { healthMessageId: messageId ?? null });
}
