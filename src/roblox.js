// Lightweight calls to official Roblox web APIs using an account's own cookie.

const AUTH_URL = 'https://auth.roblox.com';
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'KazuBot/1.2 (authorized account management)';

function cookieHeader(cookie) {
  let value = String(cookie ?? '').trim();
  if (/^\.ROBLOSECURITY=/i.test(value)) value = value.slice(value.indexOf('=') + 1);
  value = value.split(';', 1)[0].trim();
  return `.ROBLOSECURITY=${value}`;
}

function requestHeaders(cookie, extra = {}) {
  return {
    Cookie: cookieHeader(cookie),
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    ...extra,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Roblox API request timed out.');
    throw new Error(`Roblox API request failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse(res) {
  const text = await res.text();
  if (!text) return { text: '', data: null };
  try {
    return { text, data: JSON.parse(text) };
  } catch {
    return { text, data: null };
  }
}

function errorFromResponse(res, body, fallback = `Roblox API error (HTTP ${res.status})`) {
  const apiError = body?.data?.errors?.[0];
  const message = apiError?.message
    || body?.data?.message
    || body?.data?.error
    || body?.text?.slice(0, 300)
    || fallback;
  const suffix = res.status === 429 ? ' Roblox rate limit reached; wait and try again.' : '';
  return new Error(`${message}${suffix}`);
}

// Roblox commonly returns 403 for the token bootstrap request. The important
// signal is the x-csrf-token header, not the status code.
async function getCsrfToken(cookie) {
  const res = await fetchWithTimeout(`${AUTH_URL}/v2/logout`, {
    method: 'POST',
    headers: requestHeaders(cookie),
  });
  const token = res.headers.get('x-csrf-token');
  if (token) return token;
  const body = await readResponse(res);
  throw errorFromResponse(res, body, 'Roblox did not provide a CSRF token.');
}

export async function changePassword({ cookie, currentPassword, newPassword }) {
  if (!cookie) throw new Error('The account does not have a Roblox session cookie.');
  if (!currentPassword) throw new Error('Enter the current password.');
  if (!newPassword) throw new Error('Enter a new password.');

  let csrfToken = await getCsrfToken(cookie);
  let res;
  let body;

  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetchWithTimeout(`${AUTH_URL}/v2/user/passwords/change`, {
      method: 'POST',
      headers: requestHeaders(cookie, {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        Origin: 'https://www.roblox.com',
        Referer: 'https://www.roblox.com/',
      }),
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const refreshedToken = res.headers.get('x-csrf-token');
    if (res.status === 403 && refreshedToken && refreshedToken !== csrfToken) {
      csrfToken = refreshedToken;
      continue;
    }
    body = await readResponse(res);
    break;
  }

  if (!res?.ok) throw errorFromResponse(res, body);
  if (Array.isArray(body?.data?.errors) && body.data.errors.length) {
    throw new Error(body.data.errors[0]?.message || 'Roblox rejected the password change.');
  }
  if (body?.data?.success === false) {
    throw new Error(body.data.message || 'Roblox rejected the password change.');
  }
  return { confirmed: true };
}

// Confirm that Roblox still recognizes the authenticated account after the
// mutation. This is intentionally a session check, not a password guess.
export async function verifyPasswordChange(cookie) {
  if (!cookie) return false;
  try {
    const res = await fetchWithTimeout('https://users.roblox.com/v1/users/authenticated', {
      headers: requestHeaders(cookie),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// GET https://voice.roblox.com/v1/settings -> voice chat status for the account.
// Returns { enabled, verified, eligible } or null if the call fails.
export async function checkVoiceChat(cookie) {
  try {
    const res = await fetchWithTimeout('https://voice.roblox.com/v1/settings', {
      headers: requestHeaders(cookie),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      enabled: Boolean(data.isVoiceEnabled),
      verified: Boolean(data.isVerifiedForVoice),
      eligible: Boolean(data.isUserEligible),
    };
  } catch {
    return null;
  }
}
