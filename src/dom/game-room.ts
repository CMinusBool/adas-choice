import { copy, type CopyKey } from '../copy';
import {
  attendedPortal,
  currentPortal,
  isCurrentRoom,
  motionIsOn,
  openPortal,
  swipeStep,
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
 * Every string one game's expanded panel is made of, as `src/copy.ts` keys.
 *
 * 46: these are the card's own keys, unchanged in either dictionary — the card
 * went off the page with ticket 45 and its words did not. Two games share
 * `couchSetup`, exactly as the three cards did, and only Tango has a setup line
 * of its own. The game's name is not here: it is a proper noun, the same in
 * both languages, and it lives on the Portal as `data-title`.
 */
interface PanelCopy {
  readonly category: CopyKey;
  readonly pick: CopyKey;
  readonly players: CopyKey;
  readonly caption: CopyKey;
  readonly description: CopyKey;
  readonly why: CopyKey;
  readonly setup: CopyKey;
  readonly setupNote: CopyKey;
}

const PANELS: Record<PortalId, PanelCopy> = {
  tango: {
    category: 'tangoCategory',
    pick: 'tangoPick',
    players: 'tangoPlayers',
    caption: 'tangoCaption',
    description: 'tangoDescription',
    why: 'tangoWhy',
    setup: 'tangoSetup',
    setupNote: 'tangoSetupNote',
  },
  lovers: {
    category: 'loversCategory',
    pick: 'loversPick',
    players: 'loversPlayers',
    caption: 'loversCaption',
    description: 'loversDescription',
    why: 'loversWhy',
    setup: 'couchSetup',
    setupNote: 'loversSetupNote',
  },
  heavenly: {
    category: 'heavenlyCategory',
    pick: 'heavenlyPick',
    players: 'heavenlyPlayers',
    caption: 'heavenlyCaption',
    description: 'heavenlyDescription',
    why: 'heavenlyWhy',
    setup: 'couchSetup',
    setupNote: 'heavenlySetupNote',
  },
};

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
 *
 * 46: and a Portal expands. The overlay below the stage is the Activity Room's
 * card pattern — `role="dialog"`, Escape and a close button out of it, focus
 * back on the Portal that opened it — with a focus trap the Activity Room's
 * non-modal card does not need. The expanded world is not a fourth player: it
 * mirrors the open Portal's, so one sprite sheet drives both and the ellipse
 * the visitor opened keeps playing the frames it was on.
 */
export const mountGameRoom = (dispatch: Dispatch, initial: World): Painter => {
  let world = initial;
  const root = document.documentElement;
  const scene = byId('games-scene');
  const stage = document.querySelector<HTMLElement>('[data-stage="games"]')!;
  const portals = [...stage.querySelectorAll<HTMLButtonElement>('.portal')];
  const dots = [...stage.querySelectorAll<HTMLButtonElement>('.portal-dot')];
  // 47: what the dots say to the eye, said once to a screen reader.
  const announcement = byId('portal-announcement');
  const dialog = byId<HTMLDialogElement>('game-dialog');
  // 46: the expanded Portal, and the parts of it the painter fills.
  const scrim = byId('portal-scrim');
  const expanded = byId('portal-expanded');
  const expandedTitle = byId('portal-expanded-title');
  const expandedFrame = expanded.querySelector<HTMLElement>('.scene-frame')!;
  const expandedImage = expanded.querySelector<HTMLImageElement>('.game-art')!;
  const expandedSprite = expanded.querySelector<HTMLElement>('.scene-sprite')!;
  const steamLink = byId<HTMLAnchorElement>('portal-steam');
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
  // 46: the Portal the open overlay belongs to, so focus can go back to it.
  let opener: HTMLButtonElement | null = null;
  let reportQueued = false;
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
  /**
   * Sparks are the heaviest motion here, so they also honour the system ask —
   * and 46: a wall behind an overlay is throwing them at a scrim.
   */
  const sparksRun = () =>
    !paused() && !prefersReducedMotion() && !document.hidden && !dialog.open && openPortal(world) === null;

  /**
   * Whether this game's world is moving.
   *
   * 46: an expanded Portal plays whatever is or is not near the one on the
   * wall behind it — the visitor is looking straight at it, which is what the
   * expansion is for — and the other two hold still with nothing to be near.
   * Its own visibility stops mattering too: the overlay is what is on screen.
   */
  function shouldPlay(player: ScenePlayer) {
    if (paused() || !inGameRoom() || document.hidden || dialog.open) return false;
    const open = openPortal(world);
    if (open !== null) return open === player.game;
    return player.visible && attendedPortal(world) === player.game;
  }

  function syncPlayers() {
    const open = openPortal(world);
    for (const player of players) {
      // Sprites pause on their actual current frame; GIFs are a loading fallback.
      player.source.media = 'not all';
      if (!player.ready) {
        const next = (shouldPlay(player) ? player.image.dataset.animated : player.image.dataset.still)!;
        if (player.image.getAttribute('src') !== next) player.image.src = next;
      }
      if (player.game === open) mirrorIntoOverlay(player);
    }
    startClock();
  }

  /**
   * The expanded world, showing whatever the Portal underneath is showing.
   *
   * 46: the overlay owns no player of its own. Whatever the open Portal's is
   * on — a still, a GIF while its sheet loads, or the sheet at the frame it
   * has reached — is copied across, so the two never disagree and one clock
   * drives both. The alt text comes across with it, which keeps it bilingual
   * through the `data-i18n-alt` sweep that maintains the Portal's.
   */
  function mirrorIntoOverlay(player: ScenePlayer) {
    const src = player.image.getAttribute('src');
    if (src && expandedImage.getAttribute('src') !== src) expandedImage.src = src;
    if (expandedImage.alt !== player.image.alt) expandedImage.alt = player.image.alt;
    const sheet = player.sprite.dataset.sheet;
    expandedFrame.classList.toggle('has-sprite', player.ready);
    expandedSprite.hidden = !player.ready;
    if (player.ready && sheet) {
      expandedSprite.style.backgroundImage = 'url("' + sheet + '")';
      paintFrame(player);
    }
  }

  function paintFrame(player: ScenePlayer) {
    const x = (player.frame % 4) * 100 / 3;
    const y = Math.floor(player.frame / 4) * 50;
    const position = x + '% ' + y + '%';
    player.sprite.style.backgroundPosition = position;
    if (openPortal(world) === player.game) expandedSprite.style.backgroundPosition = position;
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
      syncPlayers();
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

  /**
   * Report where the visitor is on the wall. The model decides what it means.
   *
   * 46: deferred by a microtask, because opening and closing the overlay moves
   * focus and covers the wall, so the `blur` and `pointerleave` that follow
   * arrive while a paint is still running. A dispatch from inside a paint
   * re-enters the whole painter list; a microtask lands after it instead, and
   * one queued report is enough however many events raised it.
   */
  function reportAttention() {
    if (reportQueued) return;
    reportQueued = true;
    queueMicrotask(() => {
      reportQueued = false;
      // A wall behind an overlay reports nothing: it keeps whatever it had, and
      // the Portal that gets focus back on close says where the visitor is.
      if (openPortal(world) !== null) return;
      dispatch({ type: 'portal-attended', portal: focusAt ?? pointerAt });
    });
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
    // 46: a Portal is a button that expands (ADR 0004). A `<button>` fires this
    // for a click, a tap, Enter and Space alike, so there is one path in.
    portal.addEventListener('click', () => dispatch({ type: 'portal-opened', portal: player.game }));
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
   * 47: the swipe — the touch shorthand for the dots and the arrow keys, and
   * never the only way to do anything (§3.5).
   *
   * The gesture is measured across the whole stage and judged by the model:
   * 44 px across and plainly more across than down, or it is not a swipe.
   *
   * Which finger gets here is CSS's call. `#games-scene` is a horizontal
   * scroller at every width below 1080 px, and that pan is the only way a
   * phone sees the door or Luna's snow globe at all, so only the chooser — the
   * Portal and the dots — is `touch-action: pan-y`. A finger there is swiping
   * the wall; a finger on the floorboards is panning the Room, and the browser
   * says so by cancelling the pointer. A mouse cannot pan by dragging, so a
   * drag anywhere on the stage is a swipe.
   *
   * The same answer stops the click: a finger that leaves the Portal it landed
   * on was swiping the wall, not tapping a hole in it.
   */
  let gestureFrom: { pointer: number; x: number; y: number } | null = null;
  let swiped = false;

  stage.addEventListener('pointerdown', event => {
    swiped = false;
    gestureFrom = wideLayout.matches ? null : { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', event => {
    if (!gestureFrom || gestureFrom.pointer !== event.pointerId) return;
    const step = swipeStep(event.clientX - gestureFrom.x, event.clientY - gestureFrom.y);
    gestureFrom = null;
    if (step === 0) return;
    swiped = true;
    dispatch({ type: 'portal-stepped', step });
  });
  // A gesture the browser took over is the Room being panned, not the wall.
  stage.addEventListener('pointercancel', () => { gestureFrom = null; });
  // A Scene is an `<img>`, and a press that moves across one is a drag of the
  // picture as far as the browser is concerned: it cancels the pointer to
  // start the drag and the swipe is lost. Nothing here is draggable.
  stage.addEventListener('dragstart', event => event.preventDefault());
  // Capture, so the Portal's own click handler never sees the swipe's tail.
  stage.addEventListener('click', event => {
    if (!swiped) return;
    swiped = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  /**
   * The arrow keys, where the wall only has room for one Portal (§3.5).
   *
   * They do nothing on a wide wall, where all three are already up, and they
   * leave the focus where it makes sense: on the dots if that is where it was,
   * and otherwise on the Portal now on the wall — a different button, because
   * all three are in the markup and two of them are hidden, which is why
   * `paintWall` has to hand the focus on rather than let it fall on the floor.
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

  // 46: the panel's first action. The Invitation itself is untouched — same
  // dialog, same Turnstile, same Worker contract — and it now opens from the
  // expanded panel rather than from a click on the Portal.
  byId('portal-invite').addEventListener('click', () => {
    if (opener) openGame(opener);
  });
  const closeExpansion = () => dispatch({ type: 'portal-closed' });
  byId('portal-close').addEventListener('click', closeExpansion);
  scrim.addEventListener('click', closeExpansion);
  // Escape closes the expansion wherever focus is. The Invitation dialog is a
  // modal on top of it and answers Escape for itself, so it goes first.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open || openPortal(world) === null) return;
    event.preventDefault();
    closeExpansion();
  });
  /**
   * Tab stays inside the expanded Portal while it is open.
   *
   * The Activity Room's card is `aria-modal="false"` and lets Tab walk out of
   * it; this one covers the stage and says it is modal, so it owes the keyboard
   * the same answer it gives the pointer. The heading is `tabindex="-1"` and so
   * is not in the ring: focus sitting on it wraps to whichever end Tab is
   * heading for.
   */
  expanded.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || dialog.open) return;
    const stops = [...expanded.querySelectorAll<HTMLElement>('a[href], button')].filter(
      stop => !stop.hasAttribute('disabled') && stop.offsetParent !== null,
    );
    if (!stops.length) return;
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const last = stops.length - 1;
    if (at === -1) { event.preventDefault(); stops[event.shiftKey ? last : 0].focus(); return; }
    if (event.shiftKey ? at !== 0 : at !== last) return;
    event.preventDefault();
    stops[event.shiftKey ? last : 0].focus();
  });

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
  // 46: `undefined` until the first paint, so closed-on-arrival is not mistaken
  // for an overlay that has just been closed and owes the wall its focus back.
  let paintedOpen: PortalId | null | undefined;
  let paintedPanel: Language | null = null;

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
    // 47: the wall moved rather than merely being painted for the first time,
    // which is the difference between an announcement and noise on arrival.
    const moved = paintedShowing !== '' && paintedShowing !== showing;
    // 47: and whoever had the wall keeps it. Hiding the focused button drops
    // its focus on the floor, and a second arrow key would then go nowhere.
    const held = portals.some(portal => portal === document.activeElement);
    paintedWide = wide;
    paintedShowing = showing;
    for (const portal of portals) portal.hidden = !wide && portal.dataset.game !== showing;
    for (const dot of dots) dot.setAttribute('aria-current', String(dot.dataset.game === showing));
    if (held && !wide) portals.find(portal => portal.dataset.game === showing)?.focus({ preventScroll: true });
    if (moved && !wide) announceWall(showing);
    panToPortal();
    syncPlayers();
  }

  /**
   * 47: which Portal the wall is carrying, said out loud.
   *
   * The dots say it to the eye and `aria-current` says it to anyone whose
   * focus is on them; this is for the visitor who moved the wall from the
   * Portal itself or with a swipe, and never hears the dots at all. The game's
   * name is a proper noun, so only the words around it need a dictionary.
   */
  function announceWall(showing: PortalId) {
    const portal = players.find(player => player.game === showing)!.portal;
    announcement.textContent = copy[world.language].portalShowing + ' ' + portal.dataset.title;
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

  /**
   * The expanded Portal: the overlay, its panel, and where focus is.
   *
   * Everything per-game in the panel is written here rather than hooked to
   * `data-i18n`, because one panel serves three games — the Activity Room's
   * card does exactly this. No key changes value: these are the card's own,
   * left on the shelf when ticket 45 took the card off the page.
   */
  function paintExpansion() {
    const open = openPortal(world);
    if (paintedOpen === open && paintedPanel === world.language) return;
    const opening = paintedOpen !== open && open !== null;
    const closing = paintedOpen !== open && open === null && paintedOpen !== undefined;
    paintedOpen = open;
    paintedPanel = world.language;
    for (const portal of portals) portal.setAttribute('aria-expanded', String(portal.dataset.game === open));
    // Inert rather than merely covered: what the scrim hides from the pointer
    // it has to hide from the keyboard too.
    stage.inert = open !== null;
    scrim.hidden = open === null;
    expanded.hidden = open === null;
    if (open) {
      const player = players.find(item => item.game === open)!;
      opener = player.portal;
      const words = copy[world.language];
      const keys = PANELS[open];
      expanded.dataset.game = open;
      expanded.querySelector('.portal-category')!.textContent = words[keys.category];
      expanded.querySelector('.portal-pick')!.textContent = words[keys.pick];
      expanded.querySelector('.portal-players')!.textContent = words[keys.players];
      expanded.querySelector('.portal-caption')!.textContent = words[keys.caption];
      // The game's own name: a proper noun, the same in both languages, and on
      // the Portal rather than in a dictionary.
      expandedTitle.textContent = player.portal.dataset.title!;
      expanded.querySelector('.portal-description')!.textContent = words[keys.description];
      expanded.querySelector('.portal-why')!.textContent = words[keys.why];
      expanded.querySelector('.portal-setup')!.textContent = words[keys.setup];
      expanded.querySelector('.portal-setup-note')!.textContent = words[keys.setupNote];
      steamLink.href = player.portal.dataset.steam!;
      mirrorIntoOverlay(player);
    }
    // Focus follows the expansion in and back out again: into its heading, and
    // onto the Portal that opened it when it closes. The stage is inert by
    // then, so a Portal on a narrow wall has to be the one the wall carries —
    // which is why opening moved the wall onto it.
    if (opening) expandedTitle.focus({ preventScroll: wideLayout.matches });
    if (closing) {
      opener?.focus({ preventScroll: true });
      opener = null;
    }
    clearParticles();
    syncPlayers();
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
      // 47: the wall's last move was announced in the language it happened in.
      // Saying it again in the new one announces a move nobody made.
      announcement.textContent = '';
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
    paintExpansion();
  };
};
