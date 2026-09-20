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
  cinemaTitle: '放映室',
  // 17: the Cinema Room — its lede, its three bookshelves, its board and the
  // projector's two affordances. `cinemaSoon` retired when the Room was built.
  cinemaLede: '放映機暖好了。先挑一排書架，他去找片。',
  shelfComedy: '喜劇', shelfRomance: '愛情', shelfHorror: '恐怖',
  shelfComedyAria: '喜劇書架：點一下，讓他挑三部片',
  shelfRomanceAria: '愛情書架：點一下，讓他挑三部片',
  shelfHorrorAria: '恐怖書架：點一下，讓他挑三部片',
  boardLabel: '釘在牆上的海報', boardEmpty: '牆上還空著。先選一排書架。',
  projectorMotorStart: '讓放映機空轉', projectorMotorStop: '停下放映機',
  projectorGateEmpty: '還沒有膠卷。先選一部片。',
  // end 17
  // 18: what a pinned Poster offers. The Film's own title comes from
  // `src/world/films.ts` and is bilingual there; this is the rest of its name.
  posterExpandHint: '展開海報',
  // end 18
  // 19: the details panel an expanded Poster opens onto. The Film's own title,
  // year, premise and reason come from `src/world/films.ts`; these are the
  // labels around them, and they are the design note's §11 strings.
  detailsPremise: '故事', detailsReason: '為什麼值得看',
  pairingZhEn: '中文原音・英文字幕', pairingEnZh: '英文原音・中文字幕',
  detailsLink: '在 Apple TV 找到它', detailsClose: '收起',
  // end 19
  activitiesTitle: '活動室',
  // 16: the Activity Room — `activitiesSoon` retired with the Room's build.
  activitiesLede: '三件事，隔著螢幕也能一起做。挑一件，今晚就開始。',
  activityStationsLabel: '今晚可以一起做的三件事',
  activityCardWhat: '怎麼玩', activityCardNeeds: '需要準備', activityCardTime: '大約時間', activityCardWhy: '為什麼是這個',
  activityPick: '今晚就做這個', activityCardClose: '收起',
  activityChosenSuffix: '（今晚就這個了）', activityChosenNote: '今晚就這個了。想換再點另一個。',
  activityBoombox: '角落的手提音響', boomboxStart: '按下播放鍵', boomboxStop: '停下卡帶',
  pencilMugIntact: '一只裝滿鉛筆的馬克杯', pencilMugBroken: '摔成兩半的馬克杯，鉛筆滾了一地',
  activityDrawName: '盲畫大賽', activityDrawAria: '盲畫大賽：點一下看怎麼玩',
  activityDrawLine: '看著對方的臉，不看自己的紙，五分鐘畫完彼此。',
  activityDrawTime: '15 分鐘（一局 5 分鐘）', activityDrawNeeds: '一張紙、一支筆，還有五分鐘。',
  activityDrawStep1: '各自拿一張紙、一支筆，把鏡頭調到看得見整張臉。',
  activityDrawStep2: '計時五分鐘。只看對方，筆不離紙，全程不准低頭。',
  activityDrawStep3: '時間到，兩個人同時把紙舉到鏡頭前。',
  activityDrawExtra: '再來一局：換不順手的那隻手，或是改畫對方的貓。',
  activityDrawWhy: '規則逼你們盯著對方的臉整整五分鐘，而畫壞了才是最好笑的地方。',
  activityHuntName: '三十秒尋寶', activityHuntAria: '三十秒尋寶：點一下看怎麼玩',
  activityHuntLine: '輪流出題，各自衝回房間找東西，三十秒後回到鏡頭前講故事。',
  activityHuntTime: '20 分鐘', activityHuntNeeds: '什麼都不用，你們兩個房間裡的東西就夠了。',
  activityHuntStep1: '輪流出一個題目：最醜的東西、有童年味道的東西、比我們在一起還久的東西。',
  activityHuntStep2: '一起倒數三十秒，兩個人各自衝去找。',
  activityHuntStep3: '回到鏡頭前亮出來，講它的來歷，對方給它打幾分。',
  activityHuntWhy: '三件事裡只有這件會讓你們離開椅子，而真正的獎品是把對方家裡每個角落都看過一遍。',
  activityMapName: '帶我去一個地方', activityMapAria: '帶我去一個地方：點一下看怎麼玩',
  activityMapLine: '一個人分享螢幕打開街景，另一個人用嘴巴帶路。',
  activityMapTime: '30 分鐘', activityMapNeeds: '一台能分享螢幕的電腦，還有一個地圖網站。兩樣你們都已經開著了。',
  activityMapStep1: '一個人分享螢幕，把地圖切到街景。',
  activityMapStep2: '另一個人指路：往左、走到那扇門、停。',
  activityMapStep3: '輪流帶對方去三個地方：你長大的那條街、你想帶我去吃的那家店、如果不用管錢我們會住的地方。',
  activityMapWhy: '三件事裡只有這件，結束的時候你們真的去過某個地方。',
  // end 16
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
  gamesBoombox: '遊戲室的手提音響', gamesBoomboxStart: '放卡帶', gamesBoomboxStop: '停下卡帶',
  globeIntact: '一顆雪花球', globeBroken: '被貓推下去的雪花球，玻璃碎了，水也灑在地板上',
  // end 15
  // 14: the Entryway
  entrywayRadio: '玄關的收音機',
  vaseIntact: '玄關桌上插著乾燥花的花瓶', vaseBroken: '摔碎的花瓶，乾燥花散了一地',
  arrivalDescription: '他們回到家了：他背著裝了三隻貓的背包，幫她脫下大衣，貓咪一隻一隻跳出來。',
  // end 14
  // 08: the three cats. Each name says which cat it is as well as what happens
  // if you reach for her, because the sprite is the only other thing saying so.
  catMica: '三花貓 Míca：摸摸她', catMira: '虎斑貓 Mira：摸摸她', catLuna: '黑貓 Luna：摸摸她',
  // end 08
  // 09: the Cinema Room's two Breakables. The Entryway's vase (14), the Game
  // Room's snow globe (15) and the Activity Room's pencil mug (16) already
  // have their keys above; these are the two this ticket adds the markup for.
  filmCanIntact: '一盒膠卷', filmCanBroken: '被貓推下去的膠卷盒，底片散了一地',
  luckyCatIntact: '一隻招財貓', luckyCatBroken: '摔成三塊的招財貓，手還在招'
  // end 09
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
    cinemaTitle: 'The Cinema Room',
    // 17: the Cinema Room
    cinemaLede: 'The projector is warmed up. Pick a shelf and he will go and find something.',
    shelfComedy: 'Comedy', shelfRomance: 'Romance', shelfHorror: 'Horror',
    shelfComedyAria: 'Comedy shelf: click and he will pick three Films',
    shelfRomanceAria: 'Romance shelf: click and he will pick three Films',
    shelfHorrorAria: 'Horror shelf: click and he will pick three Films',
    boardLabel: 'Posters pinned to the wall', boardEmpty: 'The wall is still bare. Pick a shelf first.',
    projectorMotorStart: 'Let the projector run', projectorMotorStop: 'Stop the projector',
    projectorGateEmpty: 'No reel yet. Choose a Film first.',
    // end 17
    // 18
    posterExpandHint: 'Expand the Poster',
    // end 18
    // 19
    detailsPremise: 'The story', detailsReason: "Why it's worth watching",
    pairingZhEn: 'Chinese audio, English subtitles', pairingEnZh: 'English audio, Chinese subtitles',
    detailsLink: 'Find it on Apple TV', detailsClose: 'Close',
    // end 19
    activitiesTitle: 'The Activity Room',
    // 16: the Activity Room
    activitiesLede: 'Three things you can do together through a screen. Pick one and start tonight.',
    activityStationsLabel: 'Three things to do together tonight',
    activityCardWhat: 'How it goes', activityCardNeeds: 'What you need', activityCardTime: 'How long', activityCardWhy: 'Why this one',
    activityPick: "Let's do this one tonight", activityCardClose: 'Close',
    activityChosenSuffix: '(chosen for tonight)', activityChosenNote: 'Chosen for tonight. Pick another one to change your mind.',
    activityBoombox: 'The boombox in the corner', boomboxStart: 'Press play', boomboxStop: 'Stop the tape',
    pencilMugIntact: 'A mug full of pencils', pencilMugBroken: 'A mug broken in two, its pencils rolled across the floor',
    activityDrawName: 'The Blind Portrait', activityDrawAria: 'The Blind Portrait: click to see how it goes',
    activityDrawLine: "Five minutes with your eyes on each other's face and never on your own paper.",
    activityDrawTime: '15 minutes (5 minutes a round)', activityDrawNeeds: 'A sheet of paper, something that writes, and five minutes.',
    activityDrawStep1: 'Each take a sheet of paper and something that writes, and set your camera so your face fills it.',
    activityDrawStep2: 'Set five minutes. Look only at the other, keep the pen on the paper, and never look down.',
    activityDrawStep3: 'When the timer goes, hold your paper up to the camera at the same time.',
    activityDrawExtra: "Another round: your other hand, or draw each other's cats.",
    activityDrawWhy: 'The rule makes you look at each other’s face for five straight minutes, and the worse the drawing, the better the evening.',
    activityHuntName: 'The Thirty-Second Treasure Hunt', activityHuntAria: 'The Thirty-Second Treasure Hunt: click to see how it goes',
    activityHuntLine: 'Take turns calling a category, run and find it in your own home, and be back at the camera in thirty seconds.',
    activityHuntTime: '20 minutes', activityHuntNeeds: 'Nothing at all — whatever is already in your two rooms.',
    activityHuntStep1: 'Take turns calling a category: the ugliest thing you own, something that smells like your childhood, something older than the two of us.',
    activityHuntStep2: 'Count thirty seconds down together and both go and find it.',
    activityHuntStep3: 'Come back, hold it up, and tell the story of it. The other one scores it out of ten.',
    activityHuntWhy: 'It is the one that gets you out of the chair, and the real prize is a slow tour of each other’s home.',
    activityMapName: 'Take Me Somewhere', activityMapAria: 'Take Me Somewhere: click to see how it goes',
    activityMapLine: 'One of you shares a screen with a street-level map open; the other gives the directions out loud.',
    activityMapTime: '30 minutes', activityMapNeeds: 'One computer that can share its screen, and a map site. You already have both open.',
    activityMapStep1: 'One of you shares a screen and opens a map in street view.',
    activityMapStep2: 'The other one navigates by voice: turn left, go to that door, stop.',
    activityMapStep3: 'Take each other to three places: the street you grew up on, the place you would take me to eat, and the flat you would pick if money were no object.',
    activityMapWhy: 'It is the only one of the three where you actually end up somewhere.',
    // end 16
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
    gamesBoombox: 'The boombox in the Game Room', gamesBoomboxStart: 'Put the tape on', gamesBoomboxStop: 'Stop the tape',
    globeIntact: 'A snow globe', globeBroken: 'A snow globe the cat pushed off: the glass is broken and the water has spilled across the floor',
    // end 15
    // 14: the Entryway
    entrywayRadio: 'The hall radio',
    vaseIntact: 'A vase of dried grasses on the hall table', vaseBroken: 'The vase in pieces, its dried grasses scattered across the floor',
    arrivalDescription: 'They are home. He carries the three cats in a backpack and helps her out of her coat, and the cats climb out one by one.',
    // end 14
    // 08: the three cats
    catMica: 'Míca the calico cat: give her a fuss',
    catMira: 'Mira the tabby cat: give her a fuss',
    catLuna: 'Luna the black cat: give her a fuss',
    // end 08
    // 09: the Cinema Room's two Breakables
    filmCanIntact: 'A can of film', filmCanBroken: 'A film can the cats knocked down, its film spilled across the rug',
    luckyCatIntact: 'A lucky cat figurine', luckyCatBroken: 'A lucky cat in three pieces, its paw still beckoning'
    // end 09
  }
};
