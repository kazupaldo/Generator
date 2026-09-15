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
} from './password-automation.js';
import { recordGeneratedAccount } from './account-history.js';

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
  deferAutomaticPasswordChange = false,
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
  const changePasswordTask = applyAutomaticPasswordChange({
    client,
    guildId,
    type,
    account: generatedAccount,
    ownerId: user?.id,
  });
  const finalize = async (passwordChange) => {
    const acc = passwordChange.account;
    try {
      recordGeneratedAccount(acc);
    } catch (error) {
      console.error('Could not save generated account export history:', error.message);
    }
    recordAccountOwner(acc.username, user?.id, guildId);
    const voice = await checkVoiceChat(acc.cookie); // null if the lookup fails
    await logGeneration(client, { user, type, acc, guildId });
    return {
      ...buildAccountPayload(acc, {
        ownerId: user?.id,
        guildId,
        voice,
        includeCredentials: false,
      }),
      account: acc,
      voice,
      forcePrivate: isAutoPasswordEnabledForType(guildId, type),
      passwordChange,
    };
  };

  // Auto-generation uses this mode so the run lock is released while one
  // account waits on Roblox. Every account still gets its own final payload
  // after its own password-change request completes.
  if (deferAutomaticPasswordChange && isAutoPasswordEnabledForType(guildId, type)) {
    return {
      account: generatedAccount,
      forcePrivate: true,
      passwordChange: { deferred: true },
      finalizedPromise: changePasswordTask.then(finalize),
    };
  }

  return finalize(await changePasswordTask);
}
