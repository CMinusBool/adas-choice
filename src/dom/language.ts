import { copy, type CopyKey } from '../copy';
import { LANGUAGE_STORAGE_KEY, type Language, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

const root = document.documentElement;

/** Read the long-lived language preference. Private browsing must stay usable. */
export function readStoredLanguage(): string | null | undefined {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return undefined;
  }
}

function store(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* No storage required. */
  }
}

/**
 * Paint the whole apartment in the language the world is in.
 *
 * Every string on the page is either a `data-i18n*` attribute swept here or a
 * label a painter sets from `copy` itself — so a Room added later is bilingual
 * by writing its markup, not by extending this.
 */
export const mountLanguage = (dispatch: Dispatch): Painter => {
  const toggle = byId<HTMLButtonElement>('language-toggle');
  toggle.addEventListener('click', () => dispatch({ type: 'language-toggled' }));
  toggle.hidden = false;

  let painted: Language | null = null;
  return (world: World) => {
    if (painted === world.language) return;
    painted = world.language;
    const words = copy[world.language];
    root.lang = world.language;
    document.title = words.pageTitle;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = words.meta;
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) element.textContent = words[element.dataset.i18n as CopyKey];
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) element.setAttribute('aria-label', words[element.dataset.i18nAria as CopyKey]);
    for (const element of document.querySelectorAll<HTMLImageElement>('[data-i18n-alt]')) element.alt = words[element.dataset.i18nAlt as CopyKey];
    const toEnglish = world.language !== 'en';
    byId('language-label').textContent = toEnglish ? 'English' : '繁體中文';
    toggle.lang = toEnglish ? 'en' : 'zh-Hant';
    toggle.setAttribute('aria-label', toEnglish ? 'Switch to English' : '切換至繁體中文');
    store(world.language);
  };
};
