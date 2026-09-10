# Invitation notifications

The public GitHub Pages site contains no recipient email address or private email keys. It sends only a game ID, the fixed invitation action, explicit consent, a one-time bot-verification token, an idempotency UUID, and a honeypot field to the configured HTTPS Worker.

## Email and device information

The recipient, sender, email API key, bot-verification secret and HMAC secret are Cloudflare Worker secrets. They must never be added to `public/site-config.js`, a GitHub Actions variable, source files, or a commit. Local `.dev.vars` and `.env` files are ignored. The build puts only the bundled page and the contents of `public/` into `dist/`; the backend, documentation and configuration examples are excluded from the website artifact.

Before submitting, a visitor must agree to share the selected game, their request IP, approximate country and basic device/browser details. Cloudflare supplies the IP and country. The server reduces the untrusted User-Agent to fixed device, operating-system and browser labels. Raw User-Agent strings are not emailed. No canvas, audio, font, local-network, location-permission or cross-site fingerprinting is used.

The request fingerprint is a keyed HMAC of the IP and basic device labels. It is not a unique person or hardware identifier. VPNs, shared networks, privacy relays and spoofed browser headers affect accuracy. Fingerprints, hashed network quotas and request IDs are retained for at most 24 hours after an attempt, plus up to one hour until cleanup. Anonymous global budget counters remain for up to 48 hours plus cleanup. Raw IP/device details are not stored in the Durable Object; the recipient's inbox and email provider retain sent messages according to their settings. Bot-verification and hosting providers have their own operational processing.

## Abuse controls

- Exact HTTPS origin allowlist, restricted CORS, JSON-only POST, no cookies, strict allowed fields and a 4 KB streamed-body limit.
- Required consent and server-validated Cloudflare Turnstile proof, including hostname and action checks. Tokens are single-use.
- Edge request throttle plus a globally consistent Durable Object: up to five sending attempts per IP per hour and 30 total attempts per UTC day, with at least one second between attempts. These caps favour protecting this small personal inbox; shared networks can hit a limit together.
- Recipient and sender fixed in server secrets. Game titles and action text come from server allowlists. No arbitrary subject, body, attachment, HTML or reply-to input is accepted.
- Plain-text emails only. API errors and responses never contain the recipient, visitor metadata, provider diagnostics or secrets.
- Durable reservations and Resend idempotency keys prevent duplicate emails after double clicks or ambiguous network failures. Rate-limit state stores only keyed hashes.
- Automated tests cover validation, injection attempts, CORS, bot-token replay, duplicate requests, simultaneous requests, quotas and expired records.

These controls reduce abuse; they do not make an anonymous public endpoint immune to attacks. A distributed attacker may exhaust the daily invitation allowance, temporarily preventing legitimate invitations. The endpoint fails closed if any private setting or required protection is unavailable.

## Configuration

See `worker/README.md`. Do not enable the frontend invitation endpoint until the Worker has its secrets, origin restrictions and Turnstile widget configured. Empty frontend configuration intentionally disables sending instead of pretending a message was delivered.
