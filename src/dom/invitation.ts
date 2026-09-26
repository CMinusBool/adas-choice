import { copy, type CopyKey } from '../copy';
import { filmById, type FilmId, type Language, type PortalId, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

/**
 * The Invitation: one dialog, one Turnstile, one Worker, opened from two Rooms.
 *
 * 108: this was the Game Room's, and it moved here unchanged when the Cinema's
 * "watch this one tonight" came to offer it too — the consent, the challenge,
 * the send and every failure message are the ones 101 and 104 settled. What a
 * Room hands over is what the visitor chose: a game by its Portal, or a Film.
 * A game's name is a proper noun, the same in both languages; a Film is named
 * by its title in the visitor's language and its year, and says so again when
 * the language changes.
 *
 * The dialog's markup is the Game Room's first paint. A Film swaps the handful
 * of `data-i18n` keys that talk about playing, Steam or a game for the `film*`
 * ones, so the language sweep keeps both kinds right without knowing either.
 */
export type Invitation =
  | { readonly kind: 'game'; readonly game: PortalId; readonly title: string; readonly poster: string; readonly link: string }
  | { readonly kind: 'film'; readonly film: FilmId; readonly poster: string };

/** The strings that differ between a game and a Film, as `src/copy.ts` keys. */
interface InvitationWords {
  readonly title: CopyKey;
  readonly link: CopyKey;
  readonly consent: CopyKey;
  readonly invite: CopyKey;
  readonly sent: CopyKey;
  readonly unavailable: CopyKey;
  readonly verifyUnavailable: CopyKey;
}

const WORDS: Record<Invitation['kind'], InvitationWords> = {
  game: {
    title: 'dialogTitle',
    link: 'checkout',
    consent: 'consent',
    invite: 'invite',
    sent: 'sent',
    unavailable: 'unavailable',
    verifyUnavailable: 'verifyUnavailable',
  },
  film: {
    title: 'filmDialogTitle',
    link: 'detailsLink',
    consent: 'filmConsent',
    invite: 'filmInvite',
    sent: 'filmSent',
    unavailable: 'filmUnavailable',
    verifyUnavailable: 'filmVerifyUnavailable',
  },
};

/**
 * 104: the Turnstile error codes that mean the widget cannot run on this page at
 * all, whatever the visitor does: a site key or hostname the widget's dashboard
 * refuses (110100, 110110, and 110200 — what `localhost` gets from a widget that
 * lists only the published host), a bad parameter or a failed start (100xxx to
 * 106xxx, 110420, 110430), a browser it does not support (110500, 110510), a clock
 * or cache problem (200010, 200100), or its iframe failing to load (200500).
 * Cloudflare paints each one as a bare "Unable to connect to website" box and keeps
 * retrying. The rest — a timeout (11060x, 11062x) or a challenge that did not pass
 * (300xxx, 600xxx) — the widget recovers from by itself, so it stays.
 */
const cannotRunHere = (code: string) => /^(10[0-6]\d{3}|110(100|110|200|420|430|500|510)|200(010|100|500))$/.test(code);

let open: ((invitation: Invitation) => Promise<void>) | null = null;

/**
 * Offer the Invitation for what the visitor chose. Resolves once the dialog has
 * closed, whether an Invitation went or not; before the dialog is mounted, at once.
 */
export function openInvitation(invitation: Invitation): Promise<void> {
  return open ? open(invitation) : Promise.resolve();
}

export const mountInvitation = (_dispatch: Dispatch, initial: World): Painter => {
  let world = initial;
  const root = document.documentElement;
  const dialog = byId<HTMLDialogElement>('game-dialog');
  const inviteForm = byId<HTMLFormElement>('invite-form');
  const consent = byId<HTMLInputElement>('invite-consent');
  const sendButton = byId<HTMLButtonElement>('send-invite');
  const status = byId('invite-status');
  const widgetSlot = byId('turnstile-widget');
  const challengeNote = byId('turnstile-unavailable');
  const named = byId('dialog-game');
  const link = byId<HTMLAnchorElement>('dialog-steam');
  /** The dialog's strings that differ between a game and a Film, and which key each carries. */
  const worded: readonly [HTMLElement, keyof InvitationWords][] = [
    [byId('dialog-title'), 'title'],
    [link.querySelector<HTMLElement>('[data-i18n]')!, 'link'],
    [consent.parentElement!.querySelector<HTMLElement>('[data-i18n]')!, 'consent'],
    [challengeNote, 'verifyUnavailable'],
    [byId('send-label'), 'invite'],
  ];
  const config: AdaConfig = window.ADA_CONFIG ?? { inviteEndpoint: '', turnstileSiteKey: '' };
  const notificationsReady = /^https:\/\/[a-z0-9.-]+\.workers\.dev\/invite$/.test(config.inviteEndpoint || '') && /^[A-Za-z0-9_-]{10,100}$/.test(config.turnstileSiteKey || '');
  let invitation: Invitation | null = null;
  let closed: (() => void) | null = null;
  let pending: Promise<void> = Promise.resolve();
  let dialogRun = 0;
  let sending = false;
  let sent = false;
  let submissionId = '';
  let turnstileToken = '';
  let turnstileWidget: string | null = null;
  let turnstileLoad: Promise<Turnstile> | null = null;
  let statusKey: CopyKey | '' = '';
  // 101: the status line is saying why the last send failed. The fresh token
  // `reset()` brings back leaves it standing; only the next send, a withdrawn
  // consent or a closed dialog takes it down.
  let sendFailed = false;

  const words = () => WORDS[invitation?.kind ?? 'game'];

  function setStatus(key: CopyKey | '', error = false) {
    statusKey = key;
    status.textContent = key ? copy[world.language][key] : '';
    status.dataset.state = error ? 'error' : 'ok';
  }

  function updateSendButton() {
    sendButton.disabled = !notificationsReady || !consent.checked || !turnstileToken || sending || sent;
    byId('send-label').textContent = copy[world.language][sending ? 'sending' : words().invite];
  }

  /** Name what was chosen: a game's proper noun, or a Film's title in this language and its year. */
  function paintNamed(language: Language) {
    if (!invitation) return;
    if (invitation.kind === 'game') {
      named.textContent = invitation.title;
      named.removeAttribute('lang');
      return;
    }
    const film = filmById(invitation.film);
    named.textContent = `${film.title[language]} (${film.year})`;
    named.lang = language;
  }

  function show(chosen: Invitation): Promise<void> {
    if (dialog.open) return pending;
    invitation = chosen;
    dialogRun++;
    submissionId = crypto.randomUUID();
    sending = false;
    sent = false;
    consent.checked = false;
    consent.disabled = !notificationsReady;
    byId<HTMLInputElement>('invite-website').value = '';
    for (const [element, key] of worded) {
      element.dataset.i18n = words()[key];
      element.textContent = copy[world.language][words()[key]];
    }
    paintNamed(world.language);
    byId<HTMLImageElement>('dialog-poster').src = chosen.poster;
    link.href = chosen.kind === 'game' ? chosen.link : filmById(chosen.film).link;
    removeChallenge();
    setStatus(notificationsReady ? '' : words().unavailable);
    updateSendButton();
    pending = new Promise(resolve => (closed = resolve));
    dialog.dataset.invitation = chosen.kind;
    dialog.showModal();
    root.classList.add('dialog-open');
    return pending;
  }
  open = show;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLoad) return turnstileLoad;
    turnstileLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Unavailable'));
      script.onerror = () => { script.remove(); turnstileLoad = null; reject(new Error('Unavailable')); };
      document.head.append(script);
    });
    return turnstileLoad;
  }

  function removeChallenge() {
    if (turnstileWidget !== null && window.turnstile) window.turnstile.remove(turnstileWidget);
    turnstileWidget = null;
    turnstileToken = '';
    widgetSlot.hidden = false;
    challengeNote.hidden = true;
  }

  /** 104: take the widget down and say so in the dialog's own words, in both languages. */
  function challengeUnavailable() {
    removeChallenge();
    widgetSlot.hidden = true;
    challengeNote.hidden = false;
    setStatus('');
    updateSendButton();
  }

  async function prepareChallenge() {
    removeChallenge();
    updateSendButton();
    sendFailed = false;
    if (!consent.checked || !notificationsReady || !dialog.open) {
      // 101: withdrawing consent takes a failure message down with it.
      if (!consent.checked && status.dataset.state === 'error') setStatus('');
      return;
    }
    const run = dialogRun;
    setStatus('checking');
    try {
      const api = await loadTurnstile();
      if (run !== dialogRun || !consent.checked || !dialog.open) return;
      turnstileWidget = api.render('#turnstile-widget', {
        sitekey: config.turnstileSiteKey, action: 'play-invite', theme: 'dark', size: 'flexible', language: world.language === 'en' ? 'en' : 'zh-tw',
        // 101: a managed widget re-solves by itself a second or two after a
        // failed send's `reset()`; that token re-enables send and leaves the
        // failure message alone.
        callback: token => { if (run === dialogRun && consent.checked) { turnstileToken = token; if (!sendFailed) setStatus(''); updateSendButton(); } },
        'expired-callback': () => { turnstileToken = ''; updateSendButton(); setStatus('verifyError', true); },
        'error-callback': code => {
          if (run !== dialogRun) return;
          // 104: returning true tells Turnstile the error is handled, so it does not
          // log it; the widget comes down once the callback has returned, so
          // Turnstile is not left posting to an iframe that is already gone.
          if (cannotRunHere(String(code))) { setTimeout(() => { if (run === dialogRun) challengeUnavailable(); }); return true; }
          turnstileToken = ''; updateSendButton(); setStatus('verifyError', true);
        }
      });
    } catch { if (run === dialogRun) challengeUnavailable(); }
  }

  /** What the Worker is told was chosen: a game by id, or a Film by id, title and year. */
  function choice(chosen: Invitation) {
    if (chosen.kind === 'game') return { game: chosen.game, action: 'play-together' };
    const film = filmById(chosen.film);
    return { film: film.id, title: film.title[world.language], year: film.year, action: 'watch-together' };
  }

  consent.addEventListener('change', prepareChallenge);
  byId('dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialogRun++;
    removeChallenge();
    // 101: a closed dialog takes its failure message with it.
    sendFailed = false;
    if (status.dataset.state === 'error') setStatus('');
    root.classList.remove('dialog-open');
    const resolve = closed;
    closed = null;
    resolve?.();
  });

  inviteForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (sendButton.disabled || !invitation || !consent.checked || !turnstileToken) return;
    const run = dialogRun;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    sending = true;
    updateSendButton();
    sendFailed = false;
    setStatus('sending');
    try {
      const response = await fetch(config.inviteEndpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...choice(invitation), consent: true, requestId: submissionId, turnstileToken, website: byId<HTMLInputElement>('invite-website').value })
      });
      const result = await response.json() as { ok?: boolean };
      if (run !== dialogRun) return;
      if (!response.ok || result.ok !== true) {
        setStatus(response.status === 429 ? 'rateLimited' : response.status === 403 ? 'verifyError' : 'sendError', true);
        sendFailed = true;
        turnstileToken = '';
        if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
      } else { sent = true; setStatus(words().sent); removeChallenge(); }
    } catch {
      if (run === dialogRun) {
        setStatus('sendError', true);
        sendFailed = true;
        turnstileToken = '';
        if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
      }
    } finally { clearTimeout(timeout); if (run === dialogRun) { sending = false; updateSendButton(); } }
  });

  let paintedLanguage: Language | null = null;

  return (next: World) => {
    world = next;
    if (paintedLanguage === world.language) return;
    paintedLanguage = world.language;
    // The dialog's own painter-owned strings; everything else in it is swept by
    // `src/dom/language.ts` off its `data-i18n` hook.
    setStatus(statusKey, status.dataset.state === 'error');
    updateSendButton();
    paintNamed(world.language);
  };
};
