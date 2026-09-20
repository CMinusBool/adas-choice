import { copy, type CopyKey } from '../copy';
import {
  attendedPortal,
  currentPortal,
  isCurrentRoom,
  motionIsOn,
  type Language,
  type PortalId,
  type World,
} from '../world';
import { prefersReducedMotion } from './motion';
import { WIDE_LAYOUT, byId, type Dispatch, type Painter } from './painter';

interface ScenePlayer {
  game: PortalId;
  portal: HTMLButtonElement;
  image: HTMLImageElement;
  source: HTMLSourceElement;
  sprite: HTMLElement;
  ready: boolean;
  visible: boolean;
  frame: number;
  elapsed: number;
}

const shapes = {
  heart: '<path fill="currentColor" d="M12 21S2 15 2 8.5C2 3 9 2 12 6c3-4 10-3 10 2.5C22 15 12 21 12 21Z"/>',
  shot: '<path d="M1 12h12M5 8h6M5 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="12" r="5" fill="currentColor"/><circle cx="18" cy="11" r="2" fill="#fff4f9"/>',
  spark: '<path fill="currentColor" d="m12 0 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"/>',
  ring: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="3" fill="currentColor"/>',
  diamond: '<path d="m12 2 10 10-10 10L2 12Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" stroke="currentColor" stroke-width="2"/>',
  wrench: '<path d="M20 3a6 6 0 0 0-8 7L3 19a2 2 0 0 0 3 3l9-9a6 6 0 0 0 7-8l-4 4-3-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  nut: '<path d="m7 3 10 0 5 9-5 9H7l-5-9Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>'
};

/** `bit` is drawn as text rather than an SVG path, so it has no shape entry. */
type ParticleKind = keyof typeof shapes | 'bit';

/**
 * What each Portal throws off its rim.
 *
 * The shapes are the game's, unchanged; the colours are that Portal's rim
 * palette from design note 11 §4.1 (G8a) rather than the site pink the cards
 * used, so a spark plainly comes out of *that* hole in the wall.
 */
const themes: Record<PortalId, { shapes: ParticleKind[]; colors: string[] }> = {
  tango: { shapes: ['bit', 'diamond', 'chip', 'shot'], colors: ['#4DA3D9', '#8FD0F2', '#D5E9FA'] },
  lovers: { shapes: ['heart', 'heart', 'shot', 'spark', 'ring'], colors: ['#F5A3C5', '#FFC8DE', '#FFE6A6'] },
  heavenly: { shapes: ['wrench', 'nut', 'ring', 'spark'], colors: ['#287F98', '#5CC0D9', '#CFEDF4'] }
};

const frameDurations = [600, 250, 250, 300, 300, 350, 400, 500, 300, 250, 250, 350];

/**
 * The Game Room: three Portals, their Scenes, and the Invitation.
 *
 * 45: the three cards became three Portals (`docs/adr/0004`) and this painter
 * was re-aimed rather than rewritten. The sprite-sheet playback and its
 * `shouldPlay` rules, the particle field, the dialog, the Turnstile load and
 * the invite `fetch` are the ones that were already here; what changed is what
 * decides a Scene is playing. It used to be a selected card — hover on a wide
 * shell, whichever card the scroll had brought into view on a narrow one. It
 * is now the Portal the visitor is at, and the model says which that is.
 *
 * At rest every Portal holds its first frame: three looping worlds on one wall
 * is noise, and a stopped world that starts when you come near is the whole
 * effect of looking *through* something. The rim and the sparks run all the
 * time regardless, and stop dead with motion (§5.4).
 */
export const mountGameRoom = (dispatch: Dispatch, initial: World): Painter => {
  let world = initial;
  const root = document.documentElement;
  const scene = byId('games-scene');
  const stage = document.querySelector<HTMLElement>('[data-stage="games"]')!;
  const portals = [...stage.querySelectorAll<HTMLButtonElement>('.portal')];
  const dots = [...stage.querySelectorAll<HTMLButtonElement>('.portal-dot')];
  const dialog = byId<HTMLDialogElement>('game-dialog');
  const inviteForm = byId<HTMLFormElement>('invite-form');
  const consent = byId<HTMLInputElement>('invite-consent');
  const sendButton = byId<HTMLButtonElement>('send-invite');
  const status = byId('invite-status');
  const config: AdaConfig = window.ADA_CONFIG ?? { inviteEndpoint: '', turnstileSiteKey: '' };
  const notificationsReady = /^https:\/\/[a-z0-9.-]+\.workers\.dev\/invite$/.test(config.inviteEndpoint || '') && /^[A-Za-z0-9_-]{10,100}$/.test(config.turnstileSiteKey || '');
  const wideLayout = matchMedia(WIDE_LAYOUT);
  // Hover and focus are one answer to the model, so the page keeps both and
  // reports whichever is live: focus wins, because a visitor tabbing through
  // the wall is at the Portal their focus is on whatever the mouse is over.
  let pointerAt: PortalId | null = null;
  let focusAt: PortalId | null = null;
  let frameRequest = 0;
  let lastTick = 0;
  let lastEmission = 0;
  let emitFrom = 0;
  let dialogGame: PortalId | null = null;
  let dialogRun = 0;
  let sending = false;
  let sent = false;
  let submissionId = '';
  let turnstileToken = '';
  let turnstileWidget: string | null = null;
  let turnstileLoad: Promise<Turnstile> | null = null;
  let statusKey: CopyKey | '' = '';
  const players: ScenePlayer[] = portals.map(portal => ({
    game: portal.dataset.game as PortalId,
    portal,
    image: portal.querySelector<HTMLImageElement>('.game-art')!,
    source: portal.querySelector<HTMLSourceElement>('source')!,
    sprite: portal.querySelector<HTMLElement>('.scene-sprite')!,
    ready: false,
    visible: true,
    frame: 0,
    elapsed: 0,
  }));

  const paused = () => !motionIsOn(world);
  const inGameRoom = () => isCurrentRoom(world, 'games');
  /** The Portals actually on the wall: all three, or one on a narrow one. */
  const onTheWall = () => portals.filter(portal => !portal.hidden);
  /** Sparks are the heaviest motion here, so they also honour the system ask. */
  const sparksRun = () => !paused() && !prefersReducedMotion() && !document.hidden && !dialog.open;

  function shouldPlay(player: ScenePlayer) {
    return !paused() && inGameRoom() && !document.hidden && !dialog.open && player.visible
      && attendedPortal(world) === player.game;
  }

  function syncPlayers() {
    for (const player of players) {
      // Sprites pause on their actual current frame; GIFs are a loading fallback.
      player.source.media = 'not all';
      if (!player.ready) {
        const next = (shouldPlay(player) ? player.image.dataset.animated : player.image.dataset.still)!;
        if (player.image.getAttribute('src') !== next) player.image.src = next;
      }
    }
    startClock();
  }

  function paintFrame(player: ScenePlayer) {
    const x = (player.frame % 4) * 100 / 3;
    const y = Math.floor(player.frame / 4) * 50;
    player.sprite.style.backgroundPosition = x + '% ' + y + '%';
  }

  // Keep posters available while the sprite sheets load.
  for (const player of players) {
    const sheet = player.sprite.dataset.sheet;
    if (!sheet) continue;
    const preload = new Image();
    preload.onload = () => {
      player.sprite.style.backgroundImage = 'url("' + sheet + '")';
      player.sprite.hidden = false;
      player.sprite.parentElement!.classList.add('has-sprite');
      player.ready = true;
      player.image.src = player.image.dataset.still!;
      paintFrame(player);
      startClock();
    };
    preload.src = sheet;
  }

  /**
   * One spark, thrown off a Portal's rim into the room.
   *
   * It leaves from a point on the ellipse and travels straight outward from
   * it, which is why the field is the one thing on a Portal that is not
   * clipped to the aperture.
   */
  function emitParticle(portal: HTMLElement) {
    if (!sparksRun() || !inGameRoom()) return;
    const field = portal.querySelector<HTMLElement>('.particle-field')!;
    if (field.childElementCount >= 14) return;
    const theme = themes[portal.dataset.game as PortalId];
    const kind = theme.shapes[Math.floor(Math.random() * theme.shapes.length)];
    const particle = document.createElement('span');
    particle.className = 'game-particle ' + kind;
    particle.style.color = theme.colors[Math.floor(Math.random() * theme.colors.length)];
    const size = kind === 'heart' ? 12 + Math.random() * 12 : 9 + Math.random() * 12;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    if (kind === 'bit') particle.textContent = Math.random() > .5 ? '1' : '0';
    else particle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + shapes[kind] + '</svg>';
    const rx = portal.clientWidth / 2;
    const ry = portal.clientHeight / 2;
    if (rx <= 0 || ry <= 0) return;
    const angle = Math.random() * Math.PI * 2;
    const x = rx + Math.cos(angle) * rx;
    const y = ry + Math.sin(angle) * ry;
    const distance = 26 + Math.random() * 62;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    particle.style.left = (x - size / 2) + 'px';
    particle.style.top = (y - size / 2) + 'px';
    field.append(particle);
    if (typeof particle.animate !== 'function') { particle.remove(); return; }
    const spin = (Math.random() - .5) * 180;
    const animation = particle.animate([
      { transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 0 },
      { transform: 'translate(' + dx * .18 + 'px,' + dy * .18 + 'px) scale(1) rotate(' + spin * .2 + 'deg)', opacity: .95, offset: .18 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.45) rotate(' + spin + 'deg)', opacity: 0 }
    ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' });
    animation.onfinish = () => particle.remove();
    animation.oncancel = () => particle.remove();
  }

  function clearParticles() {
    for (const field of stage.querySelectorAll('.particle-field')) {
      for (const particle of [...field.children]) {
        if (typeof particle.getAnimations === 'function') particle.getAnimations().forEach(animation => animation.cancel());
        particle.remove();
      }
    }
  }

  /** Report where the visitor is on the wall. The model decides what it means. */
  function reportAttention() {
    dispatch({ type: 'portal-attended', portal: focusAt ?? pointerAt });
  }

  function tick(now: number) {
    frameRequest = 0;
    const delta = lastTick ? Math.min(now - lastTick, 100) : 0;
    lastTick = now;
    for (const player of players) {
      if (!player.ready || !shouldPlay(player)) continue;
      player.elapsed += delta;
      if (player.elapsed >= frameDurations[player.frame]) {
        player.elapsed -= frameDurations[player.frame];
        player.frame = (player.frame + 1) % 12;
        paintFrame(player);
      }
    }
    // Every Portal throws sparks, all the time, in turn — the rim and the
    // particles are not a hover effect (ADR 0004).
    const wall = onTheWall();
    if (wall.length && sparksRun() && now - lastEmission > 150) {
      emitParticle(wall[emitFrom % wall.length]);
      emitFrom += 1;
      lastEmission = now;
    }
    startClock();
  }

  function startClock() {
    const needsClock = inGameRoom() && !document.hidden && !dialog.open
      && (players.some(player => player.ready && shouldPlay(player)) || sparksRun());
    if (needsClock && !frameRequest) frameRequest = requestAnimationFrame(tick);
    if (!needsClock) { cancelAnimationFrame(frameRequest); frameRequest = 0; lastTick = 0; }
  }

  for (const player of players) {
    const portal = player.portal;
    portal.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      pointerAt = player.game;
      reportAttention();
    });
    portal.addEventListener('pointerleave', () => { pointerAt = null; reportAttention(); });
    portal.addEventListener('focus', () => { focusAt = player.game; reportAttention(); });
    portal.addEventListener('blur', () => { focusAt = null; reportAttention(); });
    // 45: a Portal is a button that expands (ADR 0004), and ticket 46 wires the
    // expansion. Until then the click opens the Invitation dialog that was
    // behind the card, which already carries this game's poster, its name, the
    // store link and the Invitation itself — so nothing the card offered has
    // left the page, and the store link still cannot be hit by accident.
    portal.addEventListener('click', () => openGame(portal));
    portal.addEventListener('keydown', chooseByKey);
  }

  for (const dot of dots) {
    dot.addEventListener('click', () => {
      dispatch({ type: 'portal-chosen', portal: dot.dataset.game as PortalId });
      focusCurrentDot();
    });
    dot.addEventListener('keydown', chooseByKey);
  }

  /**
   * The arrow keys, where the wall only has room for one Portal (§3.5).
   *
   * They do nothing on a wide wall, where all three are already up, and they
   * leave the focus where it makes sense: on the dots if that is where it was,
   * and otherwise on the Portal, which is the same button showing another
   * game.
   */
  function chooseByKey(event: KeyboardEvent) {
    if (wideLayout.matches) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const fromDot = (event.currentTarget as HTMLElement).classList.contains('portal-dot');
    dispatch({ type: 'portal-stepped', step: event.key === 'ArrowRight' ? 1 : -1 });
    if (fromDot) focusCurrentDot();
  }

  function focusCurrentDot() {
    dots.find(dot => dot.dataset.game === currentPortal(world))?.focus();
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const player = players.find(item => item.portal === entry.target)!;
        player.visible = entry.isIntersecting;
      }
      syncPlayers();
    }, { rootMargin: '80px', threshold: 0 });
    players.forEach(player => observer.observe(player.portal));
  }

  wideLayout.addEventListener('change', () => paintWall(true));
  document.addEventListener('visibilitychange', () => { clearParticles(); lastTick = 0; syncPlayers(); });

  function setStatus(key: CopyKey | '', error = false) {
    statusKey = key;
    status.textContent = key ? copy[world.language][key] : '';
    status.dataset.state = error ? 'error' : 'ok';
  }

  function updateSendButton() {
    sendButton.disabled = !notificationsReady || !consent.checked || !turnstileToken || sending || sent;
    byId('send-label').textContent = copy[world.language][sending ? 'sending' : 'invite'];
  }

  function openGame(portal: HTMLElement) {
    dialogRun++;
    dialogGame = portal.dataset.game as PortalId;
    submissionId = crypto.randomUUID();
    sending = false;
    sent = false;
    consent.checked = false;
    consent.disabled = !notificationsReady;
    byId<HTMLInputElement>('invite-website').value = '';
    // 21: a game's name is a proper noun, the same in both languages, and no
    // dictionary types it. 45: the card that used to carry it is gone, so the
    // Portal does — along with the store URL the card's `href` used to be.
    byId('dialog-game').textContent = portal.dataset.title!;
    byId<HTMLImageElement>('dialog-poster').src = portal.querySelector<HTMLImageElement>('.game-art')!.dataset.still!;
    byId<HTMLAnchorElement>('dialog-steam').href = portal.dataset.steam!;
    removeChallenge();
    setStatus(notificationsReady ? '' : 'unavailable');
    updateSendButton();
    dialog.showModal();
    root.classList.add('dialog-open');
    clearParticles();
    syncPlayers();
  }

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
  }

  async function prepareChallenge() {
    removeChallenge();
    updateSendButton();
    if (!consent.checked || !notificationsReady || !dialog.open) return;
    const run = dialogRun;
    setStatus('checking');
    try {
      const api = await loadTurnstile();
      if (run !== dialogRun || !consent.checked || !dialog.open) return;
      turnstileWidget = api.render('#turnstile-widget', {
        sitekey: config.turnstileSiteKey, action: 'play-invite', theme: 'dark', size: 'flexible', language: world.language === 'en' ? 'en' : 'zh-tw',
        callback: token => { if (run === dialogRun && consent.checked) { turnstileToken = token; setStatus(''); updateSendButton(); } },
        'expired-callback': () => { turnstileToken = ''; updateSendButton(); setStatus('verifyError', true); },
        'error-callback': () => { turnstileToken = ''; updateSendButton(); setStatus('verifyError', true); }
      });
    } catch { if (run === dialogRun) setStatus('verifyError', true); }
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
    root.classList.remove('dialog-open');
    syncPlayers();
  });

  inviteForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (sendButton.disabled || !dialogGame || !consent.checked || !turnstileToken) return;
    const run = dialogRun;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    sending = true;
    updateSendButton();
    setStatus('sending');
    try {
      const response = await fetch(config.inviteEndpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: dialogGame, action: 'play-together', consent: true, requestId: submissionId, turnstileToken, website: byId<HTMLInputElement>('invite-website').value })
      });
      const result = await response.json() as { ok?: boolean };
      if (run !== dialogRun) return;
      if (!response.ok || result.ok !== true) {
        setStatus(response.status === 429 ? 'rateLimited' : response.status === 403 ? 'verifyError' : 'sendError', true);
        turnstileToken = '';
        if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
      } else { sent = true; setStatus('sent'); removeChallenge(); }
    } catch {
      if (run === dialogRun) {
        setStatus('sendError', true);
        turnstileToken = '';
        if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
      }
    } finally { clearTimeout(timeout); if (run === dialogRun) { sending = false; updateSendButton(); } }
  });

  let paintedLanguage: Language | null = null;
  let paintedPaused: boolean | null = null;
  let paintedInRoom: boolean | null = null;
  let paintedAwake: PortalId | null | undefined;
  let paintedShowing: PortalId | '' = '';
  let paintedWide: boolean | null = null;

  /**
   * Which Portals are on the wall.
   *
   * All three on a wide one; on a narrow one just the one the model says,
   * because three of them there are 165 px each and a world is unreadable at
   * that size (§3.5). The dots say which of the three it is.
   */
  function paintWall(force = false) {
    const wide = wideLayout.matches;
    const showing = currentPortal(world);
    if (!force && paintedWide === wide && paintedShowing === showing) return;
    paintedWide = wide;
    paintedShowing = showing;
    for (const portal of portals) portal.hidden = !wide && portal.dataset.game !== showing;
    for (const dot of dots) dot.setAttribute('aria-current', String(dot.dataset.game === showing));
    panToPortal();
    syncPlayers();
  }

  /**
   * Start the pan on the Portal the wall is carrying.
   *
   * Below 880 px of rendered width the stage keeps its 880 and the Room pans
   * from the left end, which is the door (§3.5) — so on a phone the wall's one
   * Portal begins off the right of the screen. It is what the Room is for, so
   * the pan opens on it and the door is a scroll away rather than the other
   * way round.
   */
  function panToPortal() {
    if (wideLayout.matches || scene.scrollWidth <= scene.clientWidth) return;
    const portal = portals.find(item => !item.hidden);
    if (!portal) return;
    const seen = scene.getBoundingClientRect();
    const box = portal.getBoundingClientRect();
    if (box.width === 0) return;
    scene.scrollLeft += (box.left + box.width / 2) - (seen.left + seen.width / 2);
  }

  /** The one Portal the visitor is at, playing; the other two back at rest. */
  function paintAttention() {
    const awake = attendedPortal(world);
    if (paintedAwake === awake) return;
    paintedAwake = awake;
    for (const player of players) {
      const on = player.game === awake;
      player.portal.classList.toggle('is-awake', on);
      // A world nobody is looking at goes back to the moment it was stopped
      // at, rather than holding wherever the visitor happened to walk off.
      if (!on && player.ready && player.frame !== 0) {
        player.frame = 0;
        player.elapsed = 0;
        paintFrame(player);
      }
    }
    syncPlayers();
  }

  return (next: World) => {
    world = next;
    if (paintedLanguage !== world.language) {
      paintedLanguage = world.language;
      // The dialog's own two painter-owned strings; everything else on the
      // page is swept by `src/dom/language.ts` off its `data-i18n` hook.
      setStatus(statusKey, status.dataset.state === 'error');
      updateSendButton();
    }
    if (paintedPaused !== paused()) {
      paintedPaused = paused();
      clearParticles();
      syncPlayers();
    }
    if (paintedInRoom !== inGameRoom()) {
      paintedInRoom = inGameRoom();
      clearParticles();
      syncPlayers();
      // A Room that was hidden measured nothing, so the pan is set the moment
      // it is standing rather than on the paint that opened it.
      if (paintedInRoom) panToPortal();
    }
    paintWall();
    paintAttention();
  };
};
