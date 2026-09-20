import type { CinemaShelf } from './cinema';
import type { Language } from './language';

/**
 * The nine Films the Cinema Room recommends.
 *
 * Facts, not decoration: every id, title and year here is the research note's
 * (`research/films.md`, verified 2026-09-10) and is copied verbatim. A Film is
 * a real film, so nothing about it is invented — only the Poster standing in
 * for it is original artwork.
 *
 * Film copy lives here rather than in `src/copy.ts` because it is per-Film data
 * keyed by id rather than a string the page chrome says, which is also the
 * design note's arrangement (§11: "Film titles, premises and reasons come from
 * `research/films.md`'s `films` block and are not repeated here"). It is still
 * bilingual, and the `Record<Language, string>` below is what makes that a
 * typecheck failure rather than a habit.
 */

/** Every Film, by the kebab-case of its English title. No year suffix; the nine are unique. */
export type FilmId =
  | 'knives-out'
  | 'kung-fu-hustle'
  | 'eat-drink-man-woman'
  | 'crazy-rich-asians'
  | 'about-time'
  | 'in-the-mood-for-love'
  | 'mr-vampire'
  | 'get-out'
  | 'detention';

/**
 * Which way round a Film is watched, so that neither reader subtitles all night.
 *
 * The research note's two literals: five of the nine are original Chinese audio
 * with English subtitles, four the other way about. It is a fact about the Film
 * rather than a preference, which is why it sits in the table and not in a
 * setting.
 */
export type FilmPairing = 'zh-audio-en-subs' | 'en-audio-zh-subs';

export interface Film {
  readonly id: FilmId;
  /** The bookshelf it is rolled up in, which is also its genre. */
  readonly shelf: CinemaShelf;
  /** The Taiwan release title, and the official English title. */
  readonly title: Readonly<Record<Language, string>>;
  /** The original release year, in digits in both languages. */
  readonly year: number;
  /** One sentence on what the Film is about, for the expanded Poster's panel. */
  readonly premise: Readonly<Record<Language, string>>;
  /** One sentence on why it is worth an evening, likewise. */
  readonly reason: Readonly<Record<Language, string>>;
  /** Whose ears and whose eyes: the audio and subtitle pairing, verified. */
  readonly pairing: FilmPairing;
  /**
   * The one official page a visitor is pointed at.
   *
   * ADR 0002: the apartment recommends and links out, and never carries a film.
   * It is the storefront the research note read the pairing off, so the page a
   * visitor lands on is the one that actually serves them both.
   */
  readonly link: string;
}

/**
 * Each shelf's three, in the order the Boy pins them.
 *
 * The order is the research note's tone spread, lightest Film first, so the
 * lightest of the three ends up in slot 1, nearest the shelves he took it from.
 */
const SHELVES: Readonly<Record<CinemaShelf, readonly FilmId[]>> = {
  comedy: ['knives-out', 'kung-fu-hustle', 'eat-drink-man-woman'],
  romance: ['crazy-rich-asians', 'about-time', 'in-the-mood-for-love'],
  horror: ['mr-vampire', 'get-out', 'detention'],
};

const BY_ID: Readonly<Record<FilmId, Film>> = {
  'knives-out': {
    id: 'knives-out',
    shelf: 'comedy',
    title: { 'zh-Hant': '鋒迴路轉', en: 'Knives Out' },
    year: 2019,
    premise: {
      'zh-Hant':
        '暢銷推理小說家在八十五歲生日隔天離奇身亡，一位南方口音的名偵探受匿名委託前來，全家人人有嫌疑。',
      en: 'A best-selling mystery novelist is found dead the morning after his 85th birthday, and an anonymously hired detective sits his squabbling family down one by one.',
    },
    reason: {
      'zh-Hant': '它把古典偵探片的規則玩得爛熟又出人意表，笑點和線索一樣密，而且沒有一個角色是笨蛋。',
      en: 'It knows every rule of the classic whodunit and breaks them with glee, with jokes packed as densely as the clues.',
    },
    pairing: 'en-audio-zh-subs',
    link: 'https://tv.apple.com/tw/movie/knives-out/umc.cmc.21f7rjslttoalzd6o9c6cg5ml',
  },
  'kung-fu-hustle': {
    id: 'kung-fu-hustle',
    shelf: 'comedy',
    title: { 'zh-Hant': '功夫', en: 'Kung Fu Hustle' },
    year: 2004,
    premise: {
      'zh-Hant': '一九四〇年代的上海，一個想混黑幫的小混混闖進豬籠城寨，卻發現這群市井鄰居個個身懷絕技。',
      en: 'In 1940s Shanghai a small-time wannabe gangster picks on the wrong slum, Pigsty Alley, whose landlords and tenants turn out to be retired kung fu masters.',
    },
    reason: {
      'zh-Hant': '周星馳把功夫片與卡通式的誇張搞笑揉成一體，武打場面至今仍是華語喜劇最精彩的視覺奇觀。',
      en: 'Stephen Chow fuses kung fu spectacle with cartoon slapstick, and the fights are still the most gleeful sight gags in Chinese-language comedy.',
    },
    pairing: 'zh-audio-en-subs',
    link: 'https://tv.apple.com/tw/movie/%E5%8A%9F%E5%A4%AB/umc.cmc.4g6fyvfkkkswtk7zhszfea2va',
  },
  'eat-drink-man-woman': {
    id: 'eat-drink-man-woman',
    shelf: 'comedy',
    title: { 'zh-Hant': '飲食男女', en: 'Eat Drink Man Woman' },
    year: 1994,
    premise: {
      'zh-Hant': '台北一位喪妻的名廚每週日為三個女兒做一頓大餐，餐桌上宣布的消息一次比一次驚人。',
      en: 'A widowed master chef in Taipei cooks an elaborate Sunday dinner for his three grown daughters every week, and each dinner brings an announcement bigger than the last.',
    },
    reason: {
      'zh-Hant': '李安用一道道菜寫盡一家人說不出口的感情，結局的轉折溫柔又意想不到。',
      en: 'Ang Lee lets the cooking say what the family cannot, and the last-act twist is as gentle as it is unexpected.',
    },
    pairing: 'zh-audio-en-subs',
    link: 'https://tv.apple.com/us/movie/eat-drink-man-woman/umc.cmc.170rjovicoujd242w5ugdmgkc',
  },
  'crazy-rich-asians': {
    id: 'crazy-rich-asians',
    shelf: 'romance',
    title: { 'zh-Hant': '瘋狂亞洲富豪', en: 'Crazy Rich Asians' },
    year: 2018,
    premise: {
      'zh-Hant':
        '紐約經濟學教授瑞秋陪男友回新加坡參加婚禮，才發現他是全國最富有家族的繼承人，而他的母親對她很有意見。',
      en: "New York economics professor Rachel flies to Singapore for her boyfriend's best friend's wedding and learns he is heir to the country's richest family, with a mother who has views on her.",
    },
    reason: {
      'zh-Hant': '華麗、好笑又真心，一場麻將戲就把愛情喜劇拍出了重量，也讓好萊塢重新相信這種電影。',
      en: 'Lavish, funny and sincere, it settles a whole romance over one game of mahjong and reminded Hollywood that the rom-com belongs on a big screen.',
    },
    pairing: 'en-audio-zh-subs',
    link: 'https://tv.apple.com/tw/movie/crazy-rich-asians/umc.cmc.6gjq3xvonledd0135dx4fqxqi',
  },
  'about-time': {
    id: 'about-time',
    shelf: 'romance',
    title: { 'zh-Hant': '真愛每一天', en: 'About Time' },
    year: 2013,
    premise: {
      'zh-Hant':
        '二十一歲那年，提姆得知家族裡的男人都能回到過去，他決定用這項能力追求愛情，卻發現有些事重來多少次都改不了。',
      en: 'At twenty-one Tim learns that the men in his family can travel back in time, and sets out to use it to find love, only to discover what no amount of rewinding can change.',
    },
    reason: {
      'zh-Hant': '它從輕鬆的愛情喜劇出發，最後談的是父親、家人和平凡的一天有多珍貴，看完會想立刻打電話回家。',
      en: 'It starts as a breezy romantic comedy and ends as a film about fathers and ordinary days, the kind you finish and then phone home.',
    },
    pairing: 'en-audio-zh-subs',
    link: 'https://tv.apple.com/tw/movie/%E7%9C%9F%E6%84%9B%E6%AF%8F%E4%B8%80%E5%A4%A9-about-time/umc.cmc.2vfd635fg0hxxlsqcetlzw8mp',
  },
  'in-the-mood-for-love': {
    id: 'in-the-mood-for-love',
    shelf: 'romance',
    title: { 'zh-Hant': '花樣年華', en: 'In the Mood for Love' },
    year: 2000,
    premise: {
      'zh-Hant':
        '一九六二年的香港，兩對夫妻同一天搬進隔壁，周先生與蘇太太漸漸發現各自的另一半有染，於是開始了一段不能說破的往來。',
      en: 'Hong Kong, 1962: two couples move into neighbouring rooms on the same day, and Mr. Chow and Mrs. Chan slowly realise their spouses are having an affair with each other.',
    },
    reason: {
      'zh-Hant': '每一條走廊、每一件旗袍、每一次擦身而過都拍得像一首詩，是華語電影最美的克制。',
      en: 'Every corridor, cheongsam and near miss on the stairs is composed like a poem, and nothing since has made restraint this romantic.',
    },
    pairing: 'zh-audio-en-subs',
    link: 'https://tv.apple.com/us/movie/in-the-mood-for-love/umc.cmc.85nrk9pyw9t3yvl95oo5440',
  },
  'mr-vampire': {
    id: 'mr-vampire',
    shelf: 'horror',
    title: { 'zh-Hant': '殭屍先生', en: 'Mr. Vampire' },
    year: 1985,
    premise: {
      'zh-Hant': '茅山道士九叔帶著兩個不成材的徒弟替富戶遷葬，棺裡的老爺卻變成了殭屍，全鎮的人只能學著憋氣。',
      en: "Taoist priest Master Kau and his two hapless apprentices exhume a rich family's patriarch, who has become a hopping vampire, and the whole town learns to hold its breath.",
    },
    reason: {
      'zh-Hant': '它定義了整個殭屍片類型，符咒、糯米、憋氣的規則全從這裡來，而且到今天還是一樣好笑。',
      en: 'It invented the rules of the hopping-vampire genre, talismans, sticky rice and held breath included, and forty years on it is still a joy.',
    },
    pairing: 'zh-audio-en-subs',
    link: 'https://tv.apple.com/tw/movie/mr-vampire/umc.cmc.648e5jjifil3iqwcs6jiu324w',
  },
  'get-out': {
    id: 'get-out',
    shelf: 'horror',
    title: { 'zh-Hant': '逃出絕命鎮', en: 'Get Out' },
    year: 2017,
    premise: {
      'zh-Hant': '克里斯陪白人女友回鄉見父母，一家人的過度友善很快就變得不對勁。',
      en: "Chris goes upstate to meet his white girlfriend's parents for the weekend, and the family's eager friendliness curdles into something very wrong.",
    },
    reason: {
      'zh-Hant': '好看、好笑又真的嚇人，每個伏筆都收得乾淨，拿下奧斯卡最佳原創劇本不是偶然。',
      en: 'Gripping, funny and genuinely frightening, it pays off every planted detail, and its Oscar for Best Original Screenplay was no accident.',
    },
    pairing: 'en-audio-zh-subs',
    link: 'https://tv.apple.com/tw/movie/%E9%80%83%E5%87%BA%E7%B5%95%E5%91%BD%E9%8E%AE/umc.cmc.2nh80sbq32nedy9rm09gtv8rb',
  },
  detention: {
    id: 'detention',
    shelf: 'horror',
    title: { 'zh-Hant': '返校', en: 'Detention' },
    year: 2019,
    premise: {
      'zh-Hant':
        '一九六二年戒嚴時期的翠華中學，兩名學生在深夜的校園醒來，尋找失蹤的老師時撞見的鬼魅，其實是他們不敢面對的真相。',
      en: 'Taiwan, 1962, under martial law: two students wake in their school at night and, searching for a missing teacher, meet ghosts that are really the memory of what happened to their banned-books reading group.',
    },
    reason: {
      'zh-Hant': '恐怖只是入口，真正嚇人的是白色恐怖的歷史本身，它讓一部改編自遊戲的電影拿下五座金馬獎。',
      en: 'The scares are the way in; the real horror is the history, and it carried a video-game adaptation to five Golden Horse Awards.',
    },
    pairing: 'zh-audio-en-subs',
    link: 'https://tv.apple.com/us/movie/detention/umc.cmc.whgpivhr97y8uefp0fllgyn',
  },
};

/** The three Films rolled up in one bookshelf, in the order he pins them. */
export function filmsOn(shelf: CinemaShelf): readonly FilmId[] {
  return SHELVES[shelf];
}

/** One Film by id. Every `FilmId` has a row, so this never comes back empty. */
export function filmById(id: FilmId): Film {
  return BY_ID[id];
}
