import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, randomUUID } from 'node:crypto';
import { handleInvite, DeliveryGate, deviceDetails } from '../src/index.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ORIGIN = 'https://cminusbool.github.io';
const URL = 'https://adas-choice-invitations.example.workers.dev/invite';

class Storage {
  constructor() { this.entries = new Map(); this.alarm = null; this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.entries.get(key)); }
  async put(key, value) { this.entries.set(key, structuredClone(value)); }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.entries.delete(key); }
  async list() { return structuredClone(this.entries); }
  async getAlarm() { return this.alarm; }
  async setAlarm(time) { this.alarm = time; }
  transaction(callback) {
    const result = this.queue.then(() => callback(this));
    this.queue = result.catch(() => {});
    return result;
  }
}

function fixture(t, options = {}) {
  const storage = new Storage();
  const emails = [];
  const verificationCalls = [];
  const usedTokens = new Set();
  let now = Date.parse('2026-09-09T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const env = {
    ALLOWED_ORIGINS: ORIGIN, RESEND_API_KEY: 'fake-private-key', TURNSTILE_SECRET_KEY: 'fake-turnstile-secret',
    FINGERPRINT_SECRET: 'a-long-random-test-secret-with-at-least-32-characters',
    NOTIFY_TO: 'recipient@example.invalid', NOTIFY_FROM: 'sender@example.invalid',
    REQUEST_LIMITER: { limit: async () => ({ success: options.rateSuccess !== false }) }
  };
  const gate = new DeliveryGate({ storage }, env);
  env.DELIVERY_GATE = { getByName: name => { assert.equal(name, 'invitations'); return gate; } };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const data = JSON.parse(init.body);
    if (String(url).includes('/siteverify')) {
      verificationCalls.push(data);
      const fresh = !usedTokens.has(data.response);
      usedTokens.add(data.response);
      return Response.json({ success: fresh && options.proofSuccess !== false, hostname: options.hostname || 'cminusbool.github.io', action: options.action || 'play-invite' });
    }
    assert.equal(String(url), 'https://api.resend.com/emails');
    emails.push({ ...data, headers: init.headers });
    if (options.networkError) throw new Error('upstream-private-diagnostic');
    return Response.json(options.providerStatus ? { error: 'private provider error with recipient@example.invalid' } : { id: 'email-test-id' }, { status: options.providerStatus || 200 });
  });
  function request(bodyOverrides = {}, requestOptions = {}) {
    const body = { game: 'lovers', action: 'play-together', consent: true, requestId: randomUUID(), turnstileToken: randomUUID(), website: '', ...bodyOverrides };
    const headers = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ...requestOptions.headers };
    for (const [key, value] of Object.entries(headers)) if (value === null) delete headers[key];
    const req = new Request(requestOptions.url || URL, { method: requestOptions.method || 'POST', headers, ...((requestOptions.method || 'POST') === 'POST' ? { body: requestOptions.raw ?? JSON.stringify(body) } : {}) });
    Object.defineProperty(req, 'cf', { value: { country: 'TW' } });
    return req;
  }
  return { env, gate, storage, emails, verificationCalls, request, advance: (ms = 1500) => { now += ms; } };
}

test('explicit invitation sends only fixed plain text to the secret recipient', async t => {
  const f = fixture(t);
  const response = await handleInvite(f.request(), f.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.emails.length, 1);
  const email = f.emails[0];
  assert.deepEqual(email.to, ['recipient@example.invalid']);
  assert.equal(email.subject, "Ada's choice: Lovers in a Dangerous Spacetime");
  assert.match(email.text, /IP address: 203\.0\.113\.10/);
  assert.match(email.text, /Country \(approximate\): TW/);
  assert.match(email.text, /Device: iPhone/);
  assert.match(email.text, /Browser: Safari/);
  assert.match(email.text, /Request fingerprint: [a-f0-9]{24}/);
  assert.equal(email.html, undefined);
  assert.equal(email.attachments, undefined);
  assert.equal(email.reply_to, undefined);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert(!JSON.stringify([...f.storage.entries]).includes('203.0.113.10'));
});

test('no origin, hostile origins and missing consent cannot send mail', async t => {
  const f = fixture(t);
  for (const origin of [null, 'null', 'https://evil.example', ORIGIN + '.evil.example']) {
    assert.equal((await handleInvite(f.request({}, { headers: { Origin: origin } }), f.env)).status, 403);
  }
  assert.equal((await handleInvite(f.request({ consent: false }), f.env)).status, 400);
  assert.equal(f.emails.length, 0);
  assert.equal(f.verificationCalls.length, 0);
});

test('client cannot choose recipients, headers, email content, country or device', async t => {
  const f = fixture(t);
  for (const override of [
    { to: 'attacker@example.invalid' }, { subject: 'spam' }, { html: '<script>bad()</script>' },
    { country: 'US' }, { device: 'injected' }, { game: '__proto__' }, { game: 'constructor' }, { game: ['lovers'] },
    { action: 'checkout' }, { website: 'bot.example' }, { requestId: 'invalid' }
  ]) assert.equal((await handleInvite(f.request(override), f.env)).status, 400);
  assert.equal(f.emails.length, 0);
});

test('hostile User-Agent is reduced to an allowlist of harmless labels', async t => {
  const f = fixture(t);
  const ua = 'Safari https://evil.example <img src=x onerror=attack()> Bcc: attacker@example.invalid';
  assert.equal((await handleInvite(f.request({}, { headers: { 'User-Agent': ua } }), f.env)).status, 200);
  assert(!f.emails[0].text.includes('evil.example'));
  assert(!f.emails[0].text.includes('Bcc'));
  assert(!f.emails[0].text.includes('<img'));
  assert.deepEqual(deviceDetails(''), { device: 'Desktop or other device', os: 'Other / unknown', browser: 'Other / unknown' });
});

for (const [name, option] of Object.entries({ forged: { proofSuccess: false }, wrongHost: { hostname: 'evil.example' }, wrongAction: { action: 'login' } })) {
  test('Turnstile rejects ' + name + ' proof', async t => {
    const f = fixture(t, option);
    assert.equal((await handleInvite(f.request(), f.env)).status, 403);
    assert.equal(f.emails.length, 0);
  });
}

test('a used challenge cannot be replayed and successful requests are idempotent', async t => {
  const f = fixture(t);
  const id = randomUUID();
  const token = randomUUID();
  assert.equal((await handleInvite(f.request({ requestId: id, turnstileToken: token }), f.env)).status, 200);
  f.advance();
  assert.equal((await handleInvite(f.request({ requestId: id, turnstileToken: token }), f.env)).status, 403);
  assert.equal((await handleInvite(f.request({ requestId: id }), f.env)).status, 200);
  assert.equal((await handleInvite(f.request({ requestId: id, game: 'tango' }), f.env)).status, 409);
  assert.equal(f.emails.length, 1);
});

test('five requests per network per hour, even with new request IDs', async t => {
  const f = fixture(t);
  for (let i = 0; i < 5; i++) { assert.equal((await handleInvite(f.request(), f.env)).status, 200); f.advance(); }
  const limited = await handleInvite(f.request(), f.env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '3600');
  assert.equal(f.emails.length, 5);
});

test('global daily mailbox budget cannot be bypassed with different IPs', async t => {
  const f = fixture(t);
  for (let i = 0; i < 30; i++) {
    assert.equal((await handleInvite(f.request({}, { headers: { 'CF-Connecting-IP': '203.0.113.' + (i + 1) } }), f.env)).status, 200);
    f.advance();
  }
  assert.equal((await handleInvite(f.request({}, { headers: { 'CF-Connecting-IP': '198.51.100.12' } }), f.env)).status, 429);
  assert.equal(f.emails.length, 30);
});

test('concurrent requests share the same global reservation', async t => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => handleInvite(f.request(), f.env)));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 429).length, 7);
  assert.equal(f.emails.length, 1);
});

test('edge limiter rejects requests before bot verification or delivery', async t => {
  const f = fixture(t, { rateSuccess: false });
  assert.equal((await handleInvite(f.request(), f.env)).status, 429);
  assert.equal(f.verificationCalls.length, 0);
  assert.equal(f.emails.length, 0);
});

test('oversized and malformed bodies, bad content types and wrong methods fail closed', async t => {
  const f = fixture(t);
  assert.equal((await handleInvite(f.request({}, { raw: 'x'.repeat(5000) }), f.env)).status, 413);
  assert.equal((await handleInvite(f.request({}, { raw: '{' }), f.env)).status, 400);
  assert.equal((await handleInvite(f.request({}, { headers: { 'Content-Type': 'text/plain' } }), f.env)).status, 415);
  assert.equal((await handleInvite(f.request({}, { method: 'GET' }), f.env)).status, 405);
  assert.equal((await handleInvite(f.request({}, { url: URL + '/elsewhere' }), f.env)).status, 404);
  assert.equal((await handleInvite(f.request({}, { headers: { 'CF-Connecting-IP': null, 'X-Forwarded-For': '203.0.113.3' } }), f.env)).status, 403);
  assert.equal(f.emails.length, 0);
});

test('upstream failures never expose recipient, private keys or diagnostics', async t => {
  const f = fixture(t, { providerStatus: 401 });
  const response = await handleInvite(f.request(), f.env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'unavailable' });
  assert.equal(f.emails.length, 1);
});

test('missing private configuration never sends mail', async t => {
  const f = fixture(t);
  delete f.env.NOTIFY_TO;
  assert.equal((await handleInvite(f.request(), f.env)).status, 503);
  assert.equal(f.emails.length, 0);
});

test('preflight is restricted to the intended origin, POST and JSON header', async t => {
  const f = fixture(t);
  const good = await handleInvite(f.request({}, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), f.env);
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await handleInvite(f.request({}, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'DELETE' } }), f.env)).status, 403);
});

test('expired fingerprint records and quota data are removed', async t => {
  const f = fixture(t);
  await handleInvite(f.request(), f.env);
  assert(f.storage.entries.size > 0);
  f.advance(3 * 86400000);
  await f.gate.alarm();
  assert.equal(f.storage.entries.size, 0);
});
