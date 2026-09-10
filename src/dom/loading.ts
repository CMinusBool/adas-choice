import { isInteractive, loadingProgress, type AssetOutcome, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

/**
 * Assets to preload that no Room's markup mentions.
 *
 * Empty today, and deliberately so: everything the apartment paints itself with
 * is an attribute on an element inside `#apartment`, which means the list below
 * is gathered from the page rather than kept by hand, and `assert-built-page.mjs`
 * has already checked every URL in it. This is the hook for the assets that
 * cannot work that way — ticket 06's audio files are the first — and anything
 * added here is waited for exactly like the rest.
 */
export const ASSETS_OUTSIDE_MARKUP: readonly string[] = [];

/**
 * The attributes the Rooms hang their artwork on.
 *
 * `src/dom/game-room.ts` turns these into `url("…")` and `img.src` at runtime,
 * so warming them here is warming exactly what a Room will ask for later.
 */
const ARTWORK_ATTRIBUTES = ['data-still', 'data-animated', 'data-sheet'] as const;

/**
 * Every URL the apartment paints itself with.
 *
 * Read out of the built page, so a Room furnished by a later ticket is preloaded
 * by writing its markup and nothing else. Attribute values are taken verbatim
 * rather than through `img.src`, which would resolve to an absolute URL and hide
 * that a Scene's `<img>` and its `data-animated` are the same one file.
 */
function artworkInTheRooms(): string[] {
  const apartment = byId('apartment');
  const urls: string[] = [];
  for (const element of apartment.querySelectorAll<HTMLElement>('[data-still], [data-animated], [data-sheet]')) {
    for (const attribute of ARTWORK_ATTRIBUTES) {
      const url = element.getAttribute(attribute);
      if (url) urls.push(url);
    }
  }
  for (const image of apartment.querySelectorAll<HTMLImageElement>('img[src]')) urls.push(image.getAttribute('src')!);
  return urls;
}

/**
 * Fetch one asset and report how it went.
 *
 * `new Image()` rather than `fetch`, because the image cache is the one a Room's
 * `<img>` and `background-image` read from later: this is a warm-up, not a
 * download. There is no timer here — progress moves only when the browser says
 * something really finished, and an asset that fails settles rather than
 * blocking, so a URL that has gone missing costs the visitor nothing.
 */
function warm(url: string, dispatch: Dispatch) {
  const image = new Image();
  const settle = (outcome: AssetOutcome) => dispatch({ type: 'asset-settled', url, outcome });
  image.addEventListener('load', () => settle('loaded'), { once: true });
  image.addEventListener('error', () => settle('failed'), { once: true });
  image.src = url;
}

/**
 * Hold the visitor at the door while the apartment's artwork loads.
 *
 * The loading screen is in `index.html`, not injected here, so the first thing
 * painted is the screen itself rather than a flash of an unfinished apartment.
 * This painter only reports what it fetched and paints what the model reports
 * back: it does not decide when the door opens.
 */
export const mountLoading = (dispatch: Dispatch): Painter => {
  const slot = byId('overlay-slot');
  const screen = byId('loading-screen');
  const track = byId('loading-track');
  const fill = byId('loading-fill');
  const percent = byId('loading-percent');
  // Everything the visitor must not reach yet. The shell is most of it, but the
  // skip link is a sibling of it, and a skip link into an inert apartment is a
  // keyboard trap of its own.
  const behindTheScreen = [...slot.parentElement!.children].filter(
    (element): element is HTMLElement => element instanceof HTMLElement && element !== slot,
  );

  const urls = [...new Set([...artworkInTheRooms(), ...ASSETS_OUTSIDE_MARKUP])];
  dispatch({ type: 'assets-declared', urls });
  for (const url of urls) warm(url, dispatch);

  let painted = -1;
  let focused = false;
  return (world: World) => {
    const progress = loadingProgress(world);
    if (progress !== painted) {
      painted = progress;
      const percentage = Math.round(progress * 100);
      // A transform the stylesheet transitions, so the reduced-motion query
      // zeroes the fill's travel without this painter knowing it happened.
      fill.style.transform = 'scaleX(' + progress + ')';
      track.setAttribute('aria-valuenow', String(percentage));
      percent.textContent = percentage + '%';
    }

    const ready = isInteractive(world);
    screen.hidden = ready;
    for (const element of behindTheScreen) element.inert = !ready;
    if (ready || focused) return;
    // Focus has to be somewhere, and everything else on the page is inert: the
    // loading screen holds it until `src/dom/rooms.ts` moves it into the Room
    // the visitor is standing in.
    focused = true;
    screen.focus({ preventScroll: true });
  };
};
