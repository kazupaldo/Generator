// Lightweight calls to official Roblox web APIs using an account's own cookie.

const AUTH_URL = 'https://auth.roblox.com';

function cookieHeader(cookie) {
  return `.ROBLOSECURITY=${cookie}`;
}

async function readError(res) {
  try {
    const data = await res.json();
    return data?.errors?.[0]?.message || data?.message || `Roblox API error (HTTP ${res.status})`;
  } catch {
    return `Roblox API error (HTTP ${res.status})`;
  }
}

// Roblox requires a CSRF token for authenticated state-changing requests.
async function getCsrfToken(cookie) {
  const res = await fetch(`${AUTH_URL}/v2/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader(cookie) },
  });
  const token = res.headers.get('x-csrf-token');
  if (!token) {
    throw new Error(res.ok ? 'Roblox did not provide a CSRF token.' : await readError(res));
  }
  return token;
}

export async function changePassword({ cookie, currentPassword, newPassword }) {
  if (!cookie) throw new Error('The account does not have a Roblox session cookie.');
  if (!currentPassword) throw new Error('Enter the current password.');
  if (!newPassword) throw new Error('Enter a new password.');

  const csrfToken = await getCsrfToken(cookie);
  const res = await fetch(`${AUTH_URL}/v2/user/passwords/change`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(cookie),
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) throw new Error(await readError(res));
  // Some Roblox responses are HTTP 200 even when the JSON body contains an
  // application-level error. Treat that as a failed mutation.
  try {
    const data = await res.clone().json();
    if (Array.isArray(data?.errors) && data.errors.length) {
      throw new Error(data.errors[0]?.message || 'Roblox rejected the password change.');
    }
    if (data?.success === false) {
      throw new Error(data.message || 'Roblox rejected the password change.');
    }
  } catch (error) {
    if (error.message?.includes('Roblox rejected')) throw error;
    // Empty response bodies are valid for this endpoint.
  }
  return { confirmed: true };
}

// Confirm that Roblox still recognizes the authenticated account after the
// mutation. This is intentionally a session check, not a password guess.
export async function verifyPasswordChange(cookie) {
  if (!cookie) return false;
  try {
    const res = await fetch('https://users.roblox.com/v1/users/authenticated', {
      headers: { Cookie: cookieHeader(cookie) },
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
    const res = await fetch('https://voice.roblox.com/v1/settings', {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
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
