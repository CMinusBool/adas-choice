# Private email endpoint

GitHub Pages hosts the page. A separate Cloudflare Worker sends the invitation email through Resend. An address placed only in Worker secrets is not visible in the page, repository, JavaScript or API responses; the hosting/email services and authorized account administrators can access it.

## One-time setup

1. Sign into Cloudflare and Resend. Resend needs either a verified sending domain or its permitted testing sender and matching account-recipient restrictions. You do not need to give a mailbox password to this app.
2. In Cloudflare Turnstile, create a managed widget restricted to `cminusbool.github.io`. Use a real production widget, not the always-pass testing keys. Save its public site key for the page and its secret key for the Worker.
3. In this directory, run `npm ci`, then `npx wrangler login`. Authenticate in your browser.
4. Set the following values with `npx wrangler secret put NAME`. Each command prompts for a value; do not put the value into the command or commit it:
   - `RESEND_API_KEY`: a Resend API key restricted to sending, preferably only the selected verified domain.
   - `TURNSTILE_SECRET_KEY`: the private Turnstile key.
   - `FINGERPRINT_SECRET`: at least 32 random characters; use a password manager to generate this.
   - `NOTIFY_TO`: your private destination email address.
   - `NOTIFY_FROM`: one bare, permitted sender email address. Sender/recipient values may not contain display names or multiple addresses.
5. Run `npm test`, `npm run check`, then `npm run deploy`. The SQLite-backed Durable Object is provisioned by the included migration. Check the current provider terms and account limits before enabling paid services; this project does not enable paid subscriptions.
6. In the root `site-config.js`, set `inviteEndpoint` to the actual deployed HTTPS `workers.dev` URL plus `/invite`, and `turnstileSiteKey` to the widget's public site key. These two values are public; none of the secrets above belong in that file.
7. Commit and push the public configuration. GitHub Actions rebuilds and publishes the page. Use the real dialog to send an invitation and confirm its arrival in your inbox.

`wrangler.jsonc` accepts only `https://cminusbool.github.io` as the web origin. If the page later uses a custom hostname, update the origin allowlist, Turnstile hostname restrictions, and the page Content Security Policy accordingly. Do not add wildcard or `null` origins.

## Local checks

`npm test` uses fake provider responses and never sends email. `npm run check` packages the Worker without deploying. `.dev.vars.example` contains only names and empty values; any actual local `.dev.vars` stays ignored.

The endpoint accepts `POST /invite`. Browser preflight is supported for the allowed origin. Other routes and methods are rejected. A response means the provider accepted the email, not that an inbox has confirmed delivery.

Read `../SECURITY.md` for the exact information collected, limitations and abuse controls.

Official references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email).
