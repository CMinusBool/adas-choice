import type { Language } from './world';

/**
 * Every piece of copy in the apartment, in both languages.
 *
 * Traditional Chinese first, because it is the default and `index.html` carries
 * the same strings as its first paint. The two dictionaries are typed against
 * each other below, so a key added here in one language fails `tsc` until the
 * other has it: "both languages, always" is enforced rather than remembered.
 */
const zhHant = {
  pageTitle: "Ada's choice — 今晚，一起玩。", meta: 'Ada 的雙人遊戲精選：Operation: Tango、Lovers in a Dangerous Spacetime 和 Heavenly Bodies。一起解謎，一起冒險。',
  skip: '跳至內容', home: "Ada's choice，回到玄關", gamesLabel: '合作遊戲精選',
  entrywayTitle: '玄關', entrywayLede: '外套先掛著。三扇門通往其他房間，想去哪一間都可以。', doorsLabel: '通往其他房間的門',
  doorGames: '遊戲室', doorCinema: '放映室', doorActivities: '活動室', backToEntryway: '回到玄關',
  cinemaTitle: '放映室', cinemaSoon: '布幕掛好了，放映機還在等第一卷膠卷。',
  activitiesTitle: '活動室', activitiesSoon: '桌上空著，等著擺上今晚要一起做的事。',
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
  footer: '最好的升級，就是有你一起。', artNote: '原創合作冒險插畫・2026 年 9 月',
  // 05: loading
  loadingTitle: '正在整理公寓⋯', loadingProgress: '載入進度', loadingNote: '畫都掛上牆之後，門就會打開。',
  // 06: audio
  mute: '關閉聲音', unmute: '開啟聲音',
  musicSourceStart: '播放房間音樂', musicSourceStop: '停止房間音樂', placeholder: '暫代',
  // end 06
  // 15: the Game Room's own Props — the boombox Music Source and Luna's snow globe.
  gamesBoombox: '遊戲室的手提音響', boomboxStart: '放卡帶', boomboxStop: '停下卡帶',
  globeIntact: '一顆雪花球', globeBroken: '被貓推下去的雪花球，玻璃碎了，水也灑在地板上'
  // end 15
};

/** Every piece of copy on the page. Both dictionaries carry the same keys. */
export type CopyKey = keyof typeof zhHant;

export const copy: Record<Language, Record<CopyKey, string>> = {
  'zh-Hant': zhHant,
  en: {
    pageTitle: "Ada's choice — Your next co-op night.", meta: "Ada's three picks for your next co-op night: Operation: Tango, Lovers in a Dangerous Spacetime, and Heavenly Bodies.",
    skip: 'Skip to the content', home: "Ada's choice, back to the Entryway", gamesLabel: 'The co-op game picks',
    entrywayTitle: 'The Entryway', entrywayLede: 'Coats off. Three doors lead out of here — take whichever one you like.', doorsLabel: 'Doors to the other Rooms',
    doorGames: 'The Game Room', doorCinema: 'The Cinema Room', doorActivities: 'The Activity Room', backToEntryway: 'Back to the Entryway',
    cinemaTitle: 'The Cinema Room', cinemaSoon: 'The screen is up. The projector is still waiting for its first reel.',
    activitiesTitle: 'The Activity Room', activitiesSoon: 'The table is clear, waiting for something to do tonight.',
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
    footer: 'Good company is the best upgrade.', artNote: 'Original cartoon scenes · September 2026',
    // 05: loading
    loadingTitle: 'Tidying the apartment…', loadingProgress: 'Loading progress', loadingNote: 'The door opens once every picture is on the wall.',
    // 06: audio
    mute: 'Mute sound', unmute: 'Unmute sound',
    musicSourceStart: "Play the Room's music", musicSourceStop: "Stop the Room's music", placeholder: 'placeholder',
    // end 06
    // 15: the Game Room
    gamesBoombox: 'The boombox in the Game Room', boomboxStart: 'Put the tape on', boomboxStop: 'Stop the tape',
    globeIntact: 'A snow globe', globeBroken: 'A snow globe the cat pushed off: the glass is broken and the water has spilled across the floor'
    // end 15
  }
};
