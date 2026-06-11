#!/usr/bin/env node
/**
 * Dummy login client.
 *
 * Creates (once) a dummy user account, then logs that user in repeatedly at a
 * RANDOM interval between MIN_MINUTES and MAX_MINUTES — not fixed to whole
 * minutes, so the gap between logins varies (e.g. 12m04s, 14m37s, 13m51s ...).
 *
 * Runs from the client machine, so each login is recorded against this
 * machine's IP / device in the app's login history.
 *
 * Usage:
 *   node scripts/dummy-login.js
 *
 * Configurable via environment variables (all optional):
 *   API_URL         default https://stock-tracker-backend-2.onrender.com/api
 *   DUMMY_USERNAME  default dummy_bot
 *   DUMMY_PASSWORD  default Dummy@Bot12345
 *   MIN_MINUTES     default 12
 *   MAX_MINUTES     default 15
 *
 * Example against a local backend:
 *   API_URL=http://localhost:8080/api node scripts/dummy-login.js
 *
 * Note: the backend locks an account after 3 consecutive failed logins, so the
 * script stops immediately on a 401/423 rather than risk locking the account.
 */

const API_URL = (process.env.API_URL || 'https://stock-tracker-backend-2.onrender.com/api').replace(/\/$/, '');
const USERNAME = process.env.DUMMY_USERNAME || 'dummy_bot';
const PASSWORD = process.env.DUMMY_PASSWORD || 'Dummy@Bot12345';
const MIN_MINUTES = Number(process.env.MIN_MINUTES || 12);
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 15);

const USER_AGENT = 'stock-tracker-dummy-login/1.0 (+node client)';

const ts = () => new Date().toISOString();
const log = (...args) => console.log(`[${ts()}]`, ...args);

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body — ignore
  }
  return { status: res.status, data };
}

/** Ensure the dummy account exists. Returns true if usable, false otherwise. */
async function ensureUser() {
  try {
    const { status, data } = await post('/auth/signup', { username: USERNAME, password: PASSWORD });
    if (status === 201) {
      log(`Created dummy user "${USERNAME}".`);
      return true;
    }
    if (status === 409) {
      log(`Dummy user "${USERNAME}" already exists — continuing.`);
      return true;
    }
    log(`Signup returned ${status}:`, data || '(no body)', '— will still try to log in.');
    return true;
  } catch (err) {
    log('Signup request failed (server unreachable?):', err.message, '— will still try to log in.');
    return true;
  }
}

/** Perform a single login. Returns 'ok' | 'fatal' | 'retry'. */
async function doLogin() {
  try {
    const { status, data } = await post('/auth/login', { username: USERNAME, password: PASSWORD });
    if (status === 200) {
      log(`Login OK (readMode=${data && data.readMode}).`);
      return 'ok';
    }
    if (status === 401) {
      log('Login failed: invalid credentials. Stopping to avoid locking the account (3 strikes).');
      return 'fatal';
    }
    if (status === 423) {
      log('Account is locked. Stopping — an admin must unlock it.');
      return 'fatal';
    }
    log(`Login returned unexpected ${status}:`, data || '(no body)', '— will retry next interval.');
    return 'retry';
  } catch (err) {
    log('Login request failed (server unreachable?):', err.message, '— will retry next interval.');
    return 'retry';
  }
}

/** Random delay in ms within [MIN_MINUTES, MAX_MINUTES], with sub-minute jitter. */
function nextDelayMs() {
  const minMs = MIN_MINUTES * 60_000;
  const maxMs = MAX_MINUTES * 60_000;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function fmtDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function scheduleNext() {
  const delay = nextDelayMs();
  const at = new Date(Date.now() + delay);
  log(`Next login in ${fmtDuration(delay)} (at ${at.toISOString()}).`);
  setTimeout(tick, delay);
}

async function tick() {
  const result = await doLogin();
  if (result === 'fatal') {
    process.exit(1);
  }
  scheduleNext();
}

async function main() {
  log(`Dummy login client starting.`);
  log(`API: ${API_URL} | user: ${USERNAME} | interval: ${MIN_MINUTES}-${MAX_MINUTES} min (randomized).`);
  await ensureUser();
  await tick();
}

main();
