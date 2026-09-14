// Shared account-generation logic used by the command and the panel/button.
import {
  canGenerateType,
  generate,
  getDailyLimit,
  getStock,
} from '../bloxgen.js';
import { checkVoiceChat } from '../roblox.js';
import { buildAccountPayload } from './ui.js';
import { logGeneration } from './logger.js';
import { ensureDeliveryReady } from './account-delivery.js';
import { requireUserApiKey } from './api-keys.js';
import { recordAccountOwner } from './account-ownership.js';
import {
  applyAutomaticPasswordChange,
  isAutoPasswordEnabledForType,
  sendAutoPasswordNotice,
} from './password-automation.js';

function inStock(stock, type) {
  const value = stock?.[type];
  return value === true || value?.available === true;
}

async function verifyGenerationEligibility(type, preflight, apiKey) {
  const { stock, limits } = preflight ?? await Promise.all([
    getStock(apiKey),
    getDailyLimit(apiKey),
  ]).then(([nextStock, nextLimits]) => ({ stock: nextStock, limits: nextLimits }));

  if (!inStock(stock, type)) {
    throw new Error(`❌ \`${type}\` is currently out of stock. Try \`+stock\` or choose another type.`);
  }
  if (!canGenerateType(limits, type)) {
    const typeLimit = limits?.accountTypes?.find((item) => item.accountType === type);
    const remaining = typeLimit?.remainingGenerations ?? limits?.remainingGenerations;
    const error = new Error(
      remaining === 0
        ? `❌ The daily limit for \`${type}\` has been reached. Try another account type.`
        : '❌ The BloxGen daily generation limit has been reached. Try again after the reset.',
    );
    error.isDailyLimit = true;
    error.accountType = type;
    throw error;
  }
  return { stock, limits };
}

// Generates an account, checks its voice chat status, logs it, and returns the
// message payload (embed + button).
export async function generateAccount(client, {
  type,
  user,
  guildId,
  fallbackChannel,
  preflight,
}) {
  const apiKey = requireUserApiKey(user?.id);
  await ensureDeliveryReady({
    client,
    guildId,
    fallbackChannel,
    user,
    type,
    forcePrivate: isAutoPasswordEnabledForType(guildId, type),
  });
  await verifyGenerationEligibility(type, preflight, apiKey);
  const generatedAccount = await generate(type, apiKey);
  const passwordChange = await applyAutomaticPasswordChange({
    guildId,
    type,
    account: generatedAccount,
  });
  const acc = passwordChange.account;
  if (passwordChange.changed) {
    await sendAutoPasswordNotice(client, {
      guildId,
      type,
      account: acc,
      ownerId: user?.id,
    });
  }
  recordAccountOwner(acc.username, user?.id, guildId);
  const voice = await checkVoiceChat(acc.cookie); // null if the lookup fails
  await logGeneration(client, { user, type, acc, guildId });
  return {
    ...buildAccountPayload(acc, { ownerId: user?.id, voice, includeCredentials: false }),
    account: acc,
    voice,
    forcePrivate: isAutoPasswordEnabledForType(guildId, type),
    passwordChange,
  };
}
