/**
 * The globals the page inherits from scripts it does not bundle.
 *
 * `public/site-config.js` is hand-edited after the Worker is deployed and stays
 * a classic script, so its values arrive on `window` rather than through an
 * import. Turnstile is loaded on demand from Cloudflare.
 */

interface AdaConfig {
  /** The deployed Worker's `/invite` URL, or `''` while invitations are off. */
  inviteEndpoint: string;
  /** The public Turnstile site key, or `''` while invitations are off. */
  turnstileSiteKey: string;
}

interface TurnstileOptions {
  sitekey: string;
  action: string;
  theme: 'auto' | 'dark' | 'light';
  size: 'flexible' | 'normal' | 'compact';
  language: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  /** Called with Cloudflare's client-side error code; returning true marks it handled. */
  'error-callback': (code: string) => boolean | void;
}

interface Turnstile {
  render(container: string, options: TurnstileOptions): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

interface Window {
  ADA_CONFIG?: AdaConfig;
  turnstile?: Turnstile;
}
