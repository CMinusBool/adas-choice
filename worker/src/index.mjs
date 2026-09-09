const GAMES = Object.freeze({ tango: 'Operation: Tango', lovers: 'Lovers in a Dangerous Spacetime', heavenly: 'Heavenly Bodies' });
const ACTION = 'play-together';
const MAX_BODY = 4096;
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set(['game', 'action', 'consent', 'requestId', 'turnstileToken', 'website']);

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function json(status, code, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Vary': 'Origin'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (status === 429) headers.set('Retry-After', '3600');
  return new Response(JSON.stringify(status < 300 ? { ok: true } : { ok: false, code }), { status, headers });
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(s => {
    try { const url = new URL(s); return url.protocol === 'https:' && url.origin === s; } catch { return false; }
  });
}

function configured(env) {
  return Boolean(env.RESEND_API_KEY && env.TURNSTILE_SECRET_KEY && env.FINGERPRINT_SECRET?.length >= 32 &&
    /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(env.NOTIFY_TO || '') &&
    /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(env.NOTIFY_FROM || '') && env.DELIVERY_GATE && env.REQUEST_LIMITER);
}

async function readBody(request) {
  if (!request.body) throw new HttpError(400, 'invalid_request');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, 'too_large');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; reader.cancel().catch(() => {}); }, 5000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new HttpError(408, 'request_timeout');
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { reader.cancel().catch(() => {}); throw new HttpError(413, 'too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new HttpError(400, 'invalid_request'); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

function validBody(body) {
  return body && !Array.isArray(body) && typeof body === 'object' && Object.keys(body).every(key => FIELDS.has(key)) &&
    typeof body.game === 'string' && Object.hasOwn(GAMES, body.game) && body.action === ACTION && body.consent === true &&
    typeof body.requestId === 'string' && UUID.test(body.requestId) &&
    typeof body.turnstileToken === 'string' && body.turnstileToken.length > 0 && body.turnstileToken.length <= 2048 &&
    (body.website === undefined || body.website === '');
}

async function hmac(secret, input) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

// Never put the raw, attacker-controlled User-Agent in an email. Only fixed labels.
export function deviceDetails(userAgent) {
  const ua = String(userAgent || '').slice(0, 1024);
  const device = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android.*Mobile/i.test(ua) ? 'Android phone' : /Android/i.test(ua) ? 'Android tablet' : /Mobile/i.test(ua) ? 'Mobile' : 'Desktop or other device';
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS / iPadOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Other / unknown';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Other / unknown';
  return { device, os, browser };
}

export async function handleInvite(request, env) {
  const origin = request.headers.get('Origin');
  const origins = allowedOrigins(env);
  if (!origin || !origins.includes(origin)) return json(403, 'not_allowed');
  if (new URL(request.url).pathname !== '/invite') return json(404, 'not_found', origin);
  if (request.method === 'OPTIONS') {
    const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== 'POST' || headers.some(h => h !== 'content-type')) return json(403, 'not_allowed', origin);
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600', 'Vary': 'Origin', 'Cache-Control': 'no-store'
    } });
  }
  if (request.method !== 'POST') return json(405, 'method_not_allowed', origin);
  if (!configured(env)) return json(503, 'unavailable', origin);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '') || request.headers.has('Content-Encoding')) return json(415, 'invalid_content_type', origin);
  try {
    // On workers.dev this header is set by Cloudflare, not read from submitted JSON.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!/^[a-f0-9:.]{3,45}$/i.test(ip)) throw new HttpError(403, 'not_allowed');
    const ipHash = await hmac(env.FINGERPRINT_SECRET, 'limit:' + ip);
    if (!(await env.REQUEST_LIMITER.limit({ key: ipHash })).success) throw new HttpError(429, 'rate_limited');
    const body = await readBody(request);
    if (!validBody(body)) throw new HttpError(400, 'invalid_request');

    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken, remoteip: ip, idempotency_key: crypto.randomUUID() })
    });
    if (!verification.ok) throw new HttpError(503, 'unavailable');
    const proof = await verification.json();
    if (proof.success !== true || proof.hostname !== new URL(origin).hostname || proof.action !== 'play-invite') throw new HttpError(403, 'verification_failed');

    const details = deviceDetails(request.headers.get('User-Agent'));
    const country = /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : 'Unknown';
    const fingerprint = (await hmac(env.FINGERPRINT_SECRET, 'request:' + ip + ':' + Object.values(details).join(':'))).slice(0, 24);
    const gate = env.DELIVERY_GATE.getByName('invitations');
    const receipt = await gate.fetch(new Request('https://delivery.internal/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: body.requestId, game: body.game, ipHash, fingerprint, ip, country, ...details })
    }));
    // Do not return recipient details, upstream errors, visitor data, or provider IDs.
    return json(receipt.status, receipt.status === 429 ? 'rate_limited' : receipt.status === 409 ? 'try_later' : 'unavailable', origin);
  } catch (error) { return json(error instanceof HttpError ? error.status : 503, error instanceof HttpError ? error.code : 'unavailable', origin); }
}

export default { fetch: handleInvite };

// One globally consistent object caps the mailbox even across Cloudflare locations.
export class DeliveryGate {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const input = await request.json();
    if (!UUID.test(input.requestId || '') || !Object.hasOwn(GAMES, input.game) || !/^[a-f0-9]{64}$/.test(input.ipHash || '') || !/^[a-f0-9]{24}$/.test(input.fingerprint || '')) return json(400, 'invalid_request');
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const requestKey = 'request:' + input.requestId;
    const ipKey = 'hour:' + Math.floor(now / 3600000) + ':' + input.ipHash;
    const globalKey = 'day:' + day;
    const reservation = await this.ctx.storage.transaction(async tx => {
      const prior = await tx.get(requestKey);
      if (prior && prior.expires > now) {
        if (prior.game !== input.game || prior.ipHash !== input.ipHash || prior.fingerprint !== input.fingerprint) return { status: 409 };
        if (prior.state === 'sent') return { status: 200 };
        if (prior.state === 'pending' && now - prior.attemptAt < 30000) return { status: 409 };
      }
      const perIP = await tx.get(ipKey) || { count: 0, expires: now + DAY };
      const global = await tx.get(globalKey) || { count: 0, lastAttemptAt: 0, expires: now + 2 * DAY };
      if (perIP.count >= 5 || global.count >= 30 || now - global.lastAttemptAt < 1000) return { status: 429 };
      const record = { game: input.game, ipHash: input.ipHash, fingerprint: input.fingerprint, state: 'pending', attemptAt: now, requestedAt: prior?.requestedAt || new Date(now).toISOString(), expires: now + DAY };
      await tx.put(ipKey, { ...perIP, count: perIP.count + 1 });
      await tx.put(globalKey, { ...global, count: global.count + 1, lastAttemptAt: now });
      await tx.put(requestKey, record);
      return { status: 201, record };
    });
    if (reservation.status !== 201) return json(reservation.status, 'not_sent');
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + 3600000);
    const record = reservation.record;
    let accepted = false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Authorization': 'Bearer ' + this.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'ada-invite-' + input.requestId },
        body: JSON.stringify({
          from: this.env.NOTIFY_FROM, to: [this.env.NOTIFY_TO],
          subject: "Ada's choice: " + GAMES[input.game],
          text: [
            'Someone chose: I want to play this with u~', 'Game: ' + GAMES[input.game], '',
            'Sent: ' + record.requestedAt, 'Country (approximate): ' + input.country, 'IP address: ' + input.ip,
            'Device: ' + input.device, 'Operating system: ' + input.os, 'Browser: ' + input.browser,
            'Request fingerprint: ' + input.fingerprint, '',
            'The visitor explicitly agreed to share these request details.',
            'Network and browser information can be shared, obscured by a VPN, or spoofed. It does not establish a unique identity.'
          ].join('\n')
        })
      });
      accepted = response.ok;
    } catch { /* A retry uses the same provider idempotency key if delivery was ambiguous. */ }
    await this.ctx.storage.put(requestKey, { ...record, state: accepted ? 'sent' : 'failed' });
    return json(accepted ? 200 : 503, 'unavailable');
  }

  async alarm() {
    const entries = await this.ctx.storage.list();
    const now = Date.now();
    const expired = [...entries].filter(([, value]) => value.expires <= now).map(([key]) => key);
    if (expired.length) await this.ctx.storage.delete(expired);
    if (entries.size > expired.length) await this.ctx.storage.setAlarm(now + 3600000);
  }
}
