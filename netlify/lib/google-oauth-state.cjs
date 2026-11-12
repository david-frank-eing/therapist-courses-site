// Signed, browser-bound OAuth state for the Google connection (12/11/2026).
//
// Before: google-auth took ?user_id= from the URL and google-callback stored the tokens under whatever
// user id came back in `state`. Anyone could send another user a consent link carrying their *own* id,
// and receive that user's Gmail and Calendar access.
//
// Now the state is  base64url(userId.expiry.nonce.signature):
//   - signature: HMAC-SHA256 over "userId.expiry.nonce", so the id cannot be swapped;
//   - nonce: also set as an HttpOnly cookie in the browser that started the flow, so a consent link
//     opened in a different browser (the victim's) has no matching cookie and is refused;
//   - expiry: ten minutes.
// The key is derived from the service key, which every function here already has. No new env var.
const crypto = require('crypto');

const COOKIE = 'carlos_g_oauth';
const TTL_MS = 10 * 60 * 1000;

function key(env) {
  const base = env.SUPABASE_SERVICE_KEY || '';
  if (base.length < 20) throw new Error('missing service key');
  return crypto.createHmac('sha256', base).update('google-oauth-state-v1').digest();
}

function sign(env, payload) {
  return crypto.createHmac('sha256', key(env)).update(payload).digest('base64url');
}

function create(env, userId, now = Date.now()) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const payload = `${userId}.${now + TTL_MS}.${nonce}`;
  const state = Buffer.from(`${payload}.${sign(env, payload)}`).toString('base64url');
  const cookie = `${COOKIE}=${nonce}; Path=/.netlify/functions/google-callback; Max-Age=${TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
  return { state, cookie };
}

function readCookie(header) {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

// Returns the user id the state was issued for, or null when anything does not match.
function verify(env, state, cookieHeader, now = Date.now()) {
  let text;
  try { text = Buffer.from(String(state || ''), 'base64url').toString('utf8'); } catch (e) { return null; }
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const [userId, expiry, nonce, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d+$/.test(expiry) || !nonce) return null;
  const want = Buffer.from(sign(env, `${userId}.${expiry}.${nonce}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (Number(expiry) < now) return null;
  const fromCookie = Buffer.from(readCookie(cookieHeader));
  const fromState = Buffer.from(nonce);
  if (fromCookie.length !== fromState.length || !crypto.timingSafeEqual(fromCookie, fromState)) return null;
  return userId;
}

const clearCookie = `${COOKIE}=; Path=/.netlify/functions/google-callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

module.exports = { create, verify, clearCookie, COOKIE };
