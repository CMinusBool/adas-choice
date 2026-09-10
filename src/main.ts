import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  resolveLanguage,
  toggleLanguage,
  type Language,
} from './world/language';

const zhHant = {
  pageTitle: "Ada's choice — 今晚，一起玩。", meta: 'Ada 的雙人遊戲精選：Operation: Tango、Lovers in a Dangerous Spacetime 和 Heavenly Bodies。一起解謎，一起冒險。',
  skip: '跳至遊戲', home: "Ada's choice，回到頂端", gamesLabel: '合作遊戲精選',
  eyebrow: '三款精選・兩個玩家', titleStart: '今晚，', titleAccent: '一起玩。', intro: '一起解謎、分享操控，在手忙腳亂時接住彼此。',
  pause: '暫停動畫', play: '播放動畫', why: '為什麼選它', setup: '開玩前準備', steam: '在 Steam 上看看', newTab: '（在新分頁開啟）',
  invite: '想跟你一起玩這個～', checkout: '去 Steam 看看', close: '關閉', dialogEyebrow: '一個小小的邀請', dialogTitle: '一起出發，好嗎？',
  consent: '我同意將這款遊戲的選擇、IP 位址、大約所在國家，以及基本裝置／瀏覽器資訊寄給網站主人。',
  privacyNote: '這些資訊也會產生一組請求識別碼，並不代表能辨識你的真實身分。不會收集你的姓名或電子郵件。',
  sending: '正在送出小小的邀請…', sent: '邀請已送出，期待一起玩 ♡', unavailable: '暫時無法寄送邀請，還是可以先去 Steam 看看。',
  sendError: '邀請暫時無法送出，請稍後再試。', rateLimited: '邀請送得有點快，請稍等一下再試。', verifyError: '請重新完成安全驗證，再送出邀請。', checking: '正在做個小小的安全驗證…',
  tangoCategory: '默契滿分', tangoCaption: '你來入侵，我來潛入。', tangoPick: '首選推薦', tangoPlayers: '2 位玩家',
  tangoDescription: '一位特務，一位駭客。兩個畫面，各自握有不同線索。把話說清楚、抓準時機，就是你們一起解開謎題的關鍵。',
  tangoWhy: '巧妙的機制、互補的角色，還有那句一起喊出的「解開了！」。', tangoSetup: '線上合作・兩台裝置＋麥克風', tangoSetupNote: '一份遊戲＋免費 Friend Pass',
  tangoAlt: '戴著眼鏡的棕髮男生負責駭客工作，黑髮女生破解保安系統，兩人一起慶祝成功。',
  loversCategory: '一艘船，兩人忙', loversCaption: '我掌舵，你救場。', loversPick: '戰術默契首選', loversPlayers: '2–4 位玩家',
  loversDescription: '一起分工駕駛、護盾和武器。大聲提醒彼此、在控制台之間奔跑，想辦法讓這艘小小太空船平安回家。',
  loversWhy: '有你喜歡的戰術與防守，也有繽紛又可愛的混亂。隨時都值得再玩一場。', couchSetup: '同機合作・Remote Play Together', loversSetupNote: '一台電腦，就能一起出發',
  loversAlt: '黑髮女生掌舵，戴眼鏡的棕髮男生操作護盾，兩人在粉紅太空船裡擋下隕石。',
  heavenlyCategory: '抓緊彼此', heavenlyCaption: '你的後背，還有靴子，都交給我。', heavenlyPick: '一起笑翻首選', heavenlyPlayers: '雙人合作',
  heavenlyDescription: '沒有重力，連小修理都變成雙人大工程。拉住隊友、遞個工具，再一起笑看最簡單的任務如何徹底失控。',
  heavenlyWhy: '物理解謎，加上令人笑翻的失誤。一起接受笨手笨腳，就是最好玩的部分。', heavenlySetupNote: '很推薦兩人都使用控制器',
  heavenlyAlt: '黑髮女太空人抓著扶手和隊友的靴子，戴眼鏡的棕髮男生伸手去拿漂浮的扳手，兩人笑得很開心。',
  footer: '最好的升級，就是有你一起。', artNote: '原創合作冒險插畫・2026 年 9 月'
};

/** Every piece of copy on the page. Both dictionaries carry the same keys. */
type CopyKey = keyof typeof zhHant;

const copy: Record<Language, Record<CopyKey, string>> = {
  'zh-Hant': zhHant,
  en: {
    pageTitle: "Ada's choice — Your next co-op night.", meta: "Ada's three picks for your next co-op night: Operation: Tango, Lovers in a Dangerous Spacetime, and Heavenly Bodies.",
    skip: 'Skip to the games', home: "Ada's choice, back to top", gamesLabel: 'The co-op game picks',
    eyebrow: 'THREE PICKS. TWO PLAYERS.', titleStart: 'Your next', titleAccent: 'co-op night.', intro: 'Crack the puzzle. Share the controls. Catch each other when things go sideways.',
    pause: 'Pause motion', play: 'Play motion', why: 'WHY IT FITS', setup: 'THE SETUP', steam: 'Open on Steam', newTab: ' in a new tab',
    invite: 'I want to play this with u~', checkout: 'Checkout on Steam', close: 'Close', dialogEyebrow: 'A LITTLE INVITATION', dialogTitle: 'A co-op date, maybe?',
    consent: 'I agree to share this game choice, my IP address, approximate country, and basic device/browser details with the page owner by email.',
    privacyNote: 'These details also create a request fingerprint, which is not a unique identity. Your name and email address are not collected.',
    sending: 'Sending a little invitation…', sent: 'Invitation sent. Here’s to playing together ♡', unavailable: 'Invitations are unavailable right now. You can still check the game on Steam.',
    sendError: 'The invitation couldn’t be sent. Please try again later.', rateLimited: 'A few too many invitations. Please wait a little before trying again.', verifyError: 'Please complete a fresh security check and try again.', checking: 'One quick safety check…',
    tangoCategory: 'The perfect partnership', tangoCaption: 'YOU HACK. I SNEAK.', tangoPick: 'BEST OVERALL', tangoPlayers: '2 players',
    tangoDescription: 'One agent. One hacker. Different clues on each screen. Talking through a problem and timing your moves together is the puzzle.',
    tangoWhy: 'Clever systems, complementary roles, and that shared “we cracked it” moment.', tangoSetup: 'Online · Two devices + microphones', tangoSetupNote: 'One copy + free Friend Pass',
    tangoAlt: 'A slim brown-haired boy with browline glasses works as a hacker while his athletic black-haired teammate cracks a security puzzle. They celebrate together.',
    loversCategory: 'One ship. Shared chaos.', loversCaption: 'I STEER. YOU SAVE US.', loversPick: 'BEST TACTICAL TEAMWORK', loversPlayers: '2–4 players',
    loversDescription: 'Split the piloting, shields, and weapons of one spaceship. Call out threats, switch stations, and somehow keep your tiny crew in one piece.',
    loversWhy: 'Your tactical and defence-game side, with plenty of colourful chaos. A great one to return to.', couchSetup: 'Couch co-op · Remote Play Together', loversSetupNote: 'A strong choice for one PC',
    loversAlt: 'An athletic black-haired girl steers a pink spaceship while a taller, slim brown-haired boy with browline glasses operates its shield. They deflect a meteor together.',
    heavenlyCategory: 'Hold on to each other', heavenlyCaption: 'GOT YOUR BACK. AND BOOT.', heavenlyPick: 'BEST SHARED SLAPSTICK', heavenlyPlayers: '2-player co-op',
    heavenlyDescription: 'Zero gravity turns a simple repair into a two-person operation. Anchor your teammate, pass a tool, and laugh when the smallest job goes spectacularly sideways.',
    heavenlyWhy: 'Physical puzzles and very funny failures. Best when you both embrace the deliberately awkward movement.', heavenlySetupNote: 'Controllers strongly recommended',
    heavenlyAlt: 'A black-haired astronaut holds a rail and her taller teammate’s boot as he reaches for a floating wrench. His brown hair and browline glasses are visible through his visor; both laugh.',
    footer: 'Good company is the best upgrade.', artNote: 'Original cartoon scenes · September 2026'
  }
};

/** index.html guarantees these ids, so a miss is a bug rather than a state. */
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

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

const root = document.documentElement;
const games = byId('games');
const wraps = [...document.querySelectorAll<HTMLElement>('.game-wrap')];
const motionToggle = byId<HTMLButtonElement>('motion-toggle');
const languageToggle = byId<HTMLButtonElement>('language-toggle');
const dialog = byId<HTMLDialogElement>('game-dialog');
const inviteForm = byId<HTMLFormElement>('invite-form');
const consent = byId<HTMLInputElement>('invite-consent');
const sendButton = byId<HTMLButtonElement>('send-invite');
const status = byId('invite-status');
const config: AdaConfig = window.ADA_CONFIG ?? { inviteEndpoint: '', turnstileSiteKey: '' };
const notificationsReady = /^https:\/\/[a-z0-9.-]+\.workers\.dev\/invite$/.test(config.inviteEndpoint || '') && /^[A-Za-z0-9_-]{10,100}$/.test(config.turnstileSiteKey || '');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const wideLayout = matchMedia('(min-width: 1080px)');
let language: Language = DEFAULT_LANGUAGE;
let paused = reducedMotion.matches;
let userMotionOverride = false;
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
const gameNames: Record<GameKey, string> = { tango: 'Operation: Tango', lovers: 'Lovers in a Dangerous Spacetime', heavenly: 'Heavenly Bodies' };
const frameDurations = [600, 250, 250, 300, 300, 350, 400, 500, 300, 250, 250, 350];
const players: ScenePlayer[] = wraps.map(wrap => ({ wrap, image: wrap.querySelector<HTMLImageElement>('.game-art')!, source: wrap.querySelector<HTMLSourceElement>('source')!, sprite: wrap.querySelector<HTMLElement>('.scene-sprite')!, ready: false, visible: true, frame: 0, elapsed: 0 }));

// Storage is optional: private browsing must remain usable.
try { language = resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)); } catch { /* Use Traditional Chinese. */ }

function updateMotionLabel() {
  const label = copy[language][paused ? 'play' : 'pause'];
  byId('motion-label').textContent = label;
  motionToggle.setAttribute('aria-label', label);
  motionToggle.setAttribute('aria-pressed', String(paused));
}

function setLanguage(next: Language) {
  language = next;
  root.lang = language;
  document.title = copy[language].pageTitle;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = copy[language].meta;
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) element.textContent = copy[language][element.dataset.i18n as CopyKey];
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) element.setAttribute('aria-label', copy[language][element.dataset.i18nAria as CopyKey]);
  for (const element of document.querySelectorAll<HTMLImageElement>('[data-i18n-alt]')) element.alt = copy[language][element.dataset.i18nAlt as CopyKey];
  const toEnglish = language !== 'en';
  byId('language-label').textContent = toEnglish ? 'English' : '繁體中文';
  languageToggle.lang = toEnglish ? 'en' : 'zh-Hant';
  languageToggle.setAttribute('aria-label', toEnglish ? 'Switch to English' : '切換至繁體中文');
  updateMotionLabel();
  clearSelection();
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* No storage required. */ }
}

function shouldPlay(player: ScenePlayer) {
  const selected = scrollDriven() ? scrolledCard : active;
  return !paused && !document.hidden && !dialog.open && player.visible && (scrollDriven() ? selected === player.wrap : !selected || selected === player.wrap);
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

function emitParticle(wrap: HTMLElement) {
  if (paused || reducedMotion.matches || document.hidden || dialog.open) return;
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
  if (scrollDriven()) {
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
  const needsClock = !paused && !document.hidden && !dialog.open && (players.some(p => p.ready && shouldPlay(p)) || Boolean(particleCard));
  if (needsClock && !frameRequest) frameRequest = requestAnimationFrame(tick);
  if (!needsClock) { cancelAnimationFrame(frameRequest); frameRequest = 0; lastTick = 0; }
}

function applyMotion() {
  root.classList.toggle('motion-off', paused);
  updateMotionLabel();
  clearParticles();
  syncPlayers();
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

languageToggle.hidden = false;
motionToggle.hidden = false;
setLanguage(language);
updateScrollCard();
applyMotion();
languageToggle.addEventListener('click', () => setLanguage(toggleLanguage(language)));
motionToggle.addEventListener('click', () => { userMotionOverride = true; paused = !paused; applyMotion(); });
reducedMotion.addEventListener('change', () => {
  if (!userMotionOverride) paused = reducedMotion.matches;
  applyMotion();
});
wideLayout.addEventListener('change', updateLayout);
finePointer.addEventListener('change', updateLayout);
document.addEventListener('visibilitychange', () => { clearParticles(); lastTick = 0; updateScrollCard(); syncPlayers(); });
window.addEventListener('resize', updateLayout, { passive: true });
window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });

function setStatus(key: CopyKey | '', error = false) {
  status.textContent = key ? copy[language][key] : '';
  status.dataset.state = error ? 'error' : 'ok';
}

function updateSendButton() {
  sendButton.disabled = !notificationsReady || !consent.checked || !turnstileToken || sending || sent;
  byId('send-label').textContent = copy[language][sending ? 'sending' : 'invite'];
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
  byId('dialog-game').textContent = gameNames[dialogGame];
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
      sitekey: config.turnstileSiteKey, action: 'play-invite', theme: 'dark', size: 'flexible', language: language === 'en' ? 'en' : 'zh-tw',
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
