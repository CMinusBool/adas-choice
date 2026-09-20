import { copy, type CopyKey } from '../copy';
import { isCurrentRoom, motionIsOn, type Language, type World } from '../world';
import { prefersReducedMotion } from './motion';
import { byId, type Dispatch, type Painter } from './painter';

type GameKey = 'tango' | 'lovers' | 'heavenly';

interface ScenePlayer {
  wrap: HTMLElement;
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

const themes: Record<GameKey, { shapes: ParticleKind[]; colors: string[] }> = {
  tango: { shapes: ['bit', 'diamond', 'chip', 'shot'], colors: ['#ffaad2', '#f36ca7', '#d5b4f6'] },
  lovers: { shapes: ['heart', 'heart', 'shot', 'spark', 'ring'], colors: ['#ff7bb7', '#ffb4d8', '#ffe6a6'] },
  heavenly: { shapes: ['wrench', 'nut', 'ring', 'spark'], colors: ['#f1bbdc', '#d9c9ff', '#ffdead'] }
};

const frameDurations = [600, 250, 250, 300, 300, 350, 400, 500, 300, 250, 250, 350];

/**
 * The Game Room: three cards, their Scenes, and the Invitation.
 *
 * Everything here was already on the page and is unchanged by the move into a
 * Room — the Scenes still pause offscreen and in a background tab, and now also
 * while the visitor is somewhere else in the apartment, which the model reports
 * rather than this file deciding.
 */
export const mountGameRoom = (_dispatch: Dispatch, initial: World): Painter => {
  let world = initial;
  const root = document.documentElement;
  const games = byId('games');
  const wraps = [...document.querySelectorAll<HTMLElement>('.game-wrap')];
  const dialog = byId<HTMLDialogElement>('game-dialog');
  const inviteForm = byId<HTMLFormElement>('invite-form');
  const consent = byId<HTMLInputElement>('invite-consent');
  const sendButton = byId<HTMLButtonElement>('send-invite');
  const status = byId('invite-status');
  const config: AdaConfig = window.ADA_CONFIG ?? { inviteEndpoint: '', turnstileSiteKey: '' };
  const notificationsReady = /^https:\/\/[a-z0-9.-]+\.workers\.dev\/invite$/.test(config.inviteEndpoint || '') && /^[A-Za-z0-9_-]{10,100}$/.test(config.turnstileSiteKey || '');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const wideLayout = matchMedia('(min-width: 1080px)');
  let active: HTMLElement | null = null;
  let scrolledCard: HTMLElement | null = null;
  let scrollFrame = 0;
  let pointerCard: HTMLElement | null = null;
  let keyboardCard: HTMLElement | null = null;
  let frameRequest = 0;
  let lastTick = 0;
  let lastEmission = 0;
  let dialogGame: GameKey | null = null;
  let dialogRun = 0;
  let sending = false;
  let sent = false;
  let submissionId = '';
  let turnstileToken = '';
  let turnstileWidget: string | null = null;
  let turnstileLoad: Promise<Turnstile> | null = null;
  const players: ScenePlayer[] = wraps.map(wrap => ({ wrap, image: wrap.querySelector<HTMLImageElement>('.game-art')!, source: wrap.querySelector<HTMLSourceElement>('source')!, sprite: wrap.querySelector<HTMLElement>('.scene-sprite')!, ready: false, visible: true, frame: 0, elapsed: 0 }));

  const paused = () => !motionIsOn(world);
  const inGameRoom = () => isCurrentRoom(world, 'games');

  function shouldPlay(player: ScenePlayer) {
    const selected = scrollDriven() ? scrolledCard : active;
    return !paused() && inGameRoom() && !document.hidden && !dialog.open && player.visible && (scrollDriven() ? selected === player.wrap : !selected || selected === player.wrap);
  }

  function scrollDriven() { return !wideLayout.matches || !finePointer.matches; }

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

  function emitParticle(wrap: HTMLElement) {
    if (paused() || !inGameRoom() || prefersReducedMotion() || document.hidden || dialog.open) return;
    const narrow = scrollDriven();
    const field = wrap.querySelector<HTMLElement>('.particle-field')!;
    if (field.childElementCount >= (narrow ? 12 : 24)) return;
    const theme = themes[wrap.dataset.game as GameKey];
    const kind = theme.shapes[Math.floor(Math.random() * theme.shapes.length)];
    const particle = document.createElement('span');
    particle.className = 'game-particle ' + kind;
    particle.style.color = theme.colors[Math.floor(Math.random() * theme.colors.length)];
    const size = kind === 'heart' ? 14 + Math.random() * 14 : 10 + Math.random() * 15;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    if (kind === 'bit') particle.textContent = Math.random() > .5 ? '1' : '0';
    else particle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + shapes[kind] + '</svg>';
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const side = Math.floor(Math.random() * 4);
    const distance = 40 + Math.random() * 75;
    let x: number, y: number, dx: number, dy: number;
    if (narrow) {
      const bounds = wrap.getBoundingClientRect();
      const top = Math.max(18, 18 - bounds.top);
      const bottom = Math.min(height - 18, window.innerHeight - bounds.top - 18);
      if (bottom <= top) return;
      const fromRight = side % 2;
      x = fromRight ? width - 4 : 4;
      y = top + Math.random() * (bottom - top);
      // Drift inward from the visible edges so phone margins don't clip the effect.
      dx = (fromRight ? -1 : 1) * (24 + Math.random() * 34);
      dy = -30 - Math.random() * 65;
    } else if (side < 2) {
      x = side ? width : 0;
      y = 20 + Math.random() * (height - 40);
      dx = distance * (side ? 1 : -1);
      dy = (Math.random() - .65) * 100;
    } else {
      x = 20 + Math.random() * (width - 40);
      y = side === 2 ? 0 : height;
      dx = (Math.random() - .5) * 100;
      dy = distance * (side === 2 ? -1 : 1);
    }
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
    for (const field of document.querySelectorAll('.particle-field')) {
      for (const particle of [...field.children]) {
        if (typeof particle.getAnimations === 'function') particle.getAnimations().forEach(animation => animation.cancel());
        particle.remove();
      }
    }
  }

  function selectCard(wrap: HTMLElement | null) {
    const next = !scrollDriven() ? wrap : null;
    if (next === active) return;
    if (next && !active) games.style.minHeight = games.getBoundingClientRect().height + 'px';
    active = next;
    if (active) games.dataset.active = active.dataset.game;
    else delete games.dataset.active;
    for (const item of wraps) {
      item.classList.toggle('is-active', item === active);
      item.classList.toggle('is-muted', Boolean(active && item !== active));
    }
    clearParticles();
    if (active) {
      for (let i = 0; i < 10; i++) emitParticle(active);
      lastEmission = performance.now();
    }
    syncPlayers();
  }

  function clearSelection() {
    pointerCard = null;
    keyboardCard = null;
    selectCard(null);
    games.style.removeProperty('min-height');
  }

  function updateScrollCard() {
    scrollFrame = 0;
    let next: HTMLElement | null = null;
    let mostVisible = 80;
    if (scrollDriven() && inGameRoom()) {
      for (const wrap of wraps) {
        const rect = wrap.getBoundingClientRect();
        const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        if (visible > mostVisible) { next = wrap; mostVisible = visible; }
      }
    }
    if (next === scrolledCard) return;
    scrolledCard = next;
    for (const wrap of wraps) wrap.classList.toggle('is-scroll-active', wrap === next);
    clearParticles();
    if (next) for (let i = 0; i < 6; i++) emitParticle(next);
    lastEmission = performance.now();
    syncPlayers();
  }

  function scheduleScrollUpdate() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollCard);
  }

  function updateLayout() { clearSelection(); updateScrollCard(); }

  // Keep the deck steady while the narrower panels regain their full copy.
  games.addEventListener('transitionend', event => {
    if (event.target === games && event.propertyName === 'grid-template-columns' && !active) {
      games.style.removeProperty('min-height');
    }
  });

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
    const particleCard = scrollDriven() ? scrolledCard : active;
    if (particleCard && !dialog.open && now - lastEmission > (scrollDriven() ? 380 : 180)) { emitParticle(particleCard); lastEmission = now; }
    startClock();
  }

  function startClock() {
    const particleCard = scrollDriven() ? scrolledCard : active;
    const needsClock = !paused() && inGameRoom() && !document.hidden && !dialog.open && (players.some(p => p.ready && shouldPlay(p)) || Boolean(particleCard));
    if (needsClock && !frameRequest) frameRequest = requestAnimationFrame(tick);
    if (!needsClock) { cancelAnimationFrame(frameRequest); frameRequest = 0; lastTick = 0; }
  }

  for (const wrap of wraps) {
    wrap.addEventListener('pointerenter', event => {
      if (scrollDriven() || event.pointerType === 'touch') return;
      pointerCard = wrap;
      selectCard(wrap);
    });
    wrap.addEventListener('pointerleave', () => { pointerCard = null; selectCard(keyboardCard); });
    const card = wrap.querySelector<HTMLAnchorElement>('.game-card')!;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-haspopup', 'dialog');
    card.setAttribute('aria-controls', 'game-dialog');
    card.addEventListener('click', event => { event.preventDefault(); openGame(wrap); });
    card.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); openGame(wrap); }
    });
    card.addEventListener('focus', () => {
      if (card.matches(':focus-visible')) { keyboardCard = wrap; selectCard(wrap); }
    });
    card.addEventListener('blur', () => { keyboardCard = null; selectCard(pointerCard); });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const player = players.find(item => item.wrap === entry.target)!;
        player.visible = entry.isIntersecting;
      }
      syncPlayers();
      scheduleScrollUpdate();
    }, { rootMargin: '80px', threshold: 0 });
    players.forEach(player => observer.observe(player.wrap));
  }

  wideLayout.addEventListener('change', updateLayout);
  finePointer.addEventListener('change', updateLayout);
  document.addEventListener('visibilitychange', () => { clearParticles(); lastTick = 0; updateScrollCard(); syncPlayers(); });
  addEventListener('resize', updateLayout, { passive: true });
  addEventListener('scroll', scheduleScrollUpdate, { passive: true });

  function setStatus(key: CopyKey | '', error = false) {
    status.textContent = key ? copy[world.language][key] : '';
    status.dataset.state = error ? 'error' : 'ok';
  }

  function updateSendButton() {
    sendButton.disabled = !notificationsReady || !consent.checked || !turnstileToken || sending || sent;
    byId('send-label').textContent = copy[world.language][sending ? 'sending' : 'invite'];
  }

  function openGame(wrap: HTMLElement) {
    dialogRun++;
    dialogGame = wrap.dataset.game as GameKey;
    submissionId = crypto.randomUUID();
    sending = false;
    sent = false;
    consent.checked = false;
    consent.disabled = !notificationsReady;
    byId<HTMLInputElement>('invite-website').value = '';
    // 21: a game's name is a proper noun, the same in both languages, and the
    // card already carries it. Read it off the card rather than keeping a third
    // copy here that no dictionary types and no build step compares.
    byId('dialog-game').textContent = wrap.querySelector('h2')!.textContent;
    byId<HTMLImageElement>('dialog-poster').src = wrap.querySelector<HTMLImageElement>('.game-art')!.dataset.still!;
    byId<HTMLAnchorElement>('dialog-steam').href = wrap.querySelector<HTMLAnchorElement>('.game-card')!.href;
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
    updateScrollCard();
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
  let paintedSettled: boolean | null = null;

  return (next: World) => {
    world = next;
    const settled = inGameRoom() && world.rooms.transition === 'settled';
    if (paintedLanguage !== world.language) {
      // The cards change height when their copy does, so the deck starts again.
      paintedLanguage = world.language;
      clearSelection();
    }
    if (paintedPaused !== paused()) {
      paintedPaused = paused();
      clearParticles();
      syncPlayers();
    }
    if (paintedInRoom !== inGameRoom()) {
      paintedInRoom = inGameRoom();
      clearSelection();
      syncPlayers();
    }
    if (paintedSettled !== settled) {
      paintedSettled = settled;
      updateScrollCard();
    }
  };
};
