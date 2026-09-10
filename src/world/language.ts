/**
 * Which of the apartment's two languages is in force.
 *
 * Traditional Chinese is the default and English is the toggle, so an absent,
 * unreadable or unrecognised preference always resolves to Traditional Chinese.
 */
export type Language = 'zh-Hant' | 'en';

export const DEFAULT_LANGUAGE: Language = 'zh-Hant';

/** The `localStorage` key the visitor's long-lived preference is kept under. */
export const LANGUAGE_STORAGE_KEY = 'ada-language';

/**
 * Resolve a stored preference into a language.
 *
 * Callers pass whatever storage gave them — including `null` when nothing is
 * stored and `undefined` when storage could not be read at all.
 */
export function resolveLanguage(stored: string | null | undefined): Language {
  return stored === 'en' ? 'en' : DEFAULT_LANGUAGE;
}

/** The language the visitor gets by using the header's language control once. */
export function toggleLanguage(current: Language): Language {
  return current === 'en' ? DEFAULT_LANGUAGE : 'en';
}
