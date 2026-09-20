import { BREAKABLE_IDS, breakableState, type BreakableId, type World } from '../world';
import { type Dispatch, type Painter } from './painter';

/**
 * Every Breakable in the apartment but the Entryway's vase.
 *
 * The vase is `src/dom/entryway.ts`'s own — it was built before this pattern
 * existed, and its two Props are found by `data-prop`, not `data-breakable` —
 * so this file paints the other four, all of which carry the generic
 * `data-breakable="<id>"` / `data-breakable-state="intact"|"broken"` pair
 * tickets 15, 16 and this one shipped. What both files agree on is the world
 * model's single `broken` set (`src/world/world.ts`) and the one place either
 * of them remembers it: session storage, read once at start-up and written
 * back here whenever anything changes, for every Breakable including the
 * vase — a new tab has nothing stored and finds the whole apartment whole.
 */

/** Session storage remembers what has broken for this tab, and no longer. */
const BROKEN_STORAGE_KEY = 'ada-broken-breakables';

function isBreakableId(value: unknown): value is BreakableId {
  return (BREAKABLE_IDS as readonly unknown[]).includes(value);
}

/**
 * What a previous visit in this tab left broken, or nothing at all.
 *
 * Read once, at start-up, and handed to the world as an input — the model
 * never asks the browser anything. Private browsing, a storage that throws, or
 * a value some other script left behind must all still leave a whole
 * apartment rather than a crash.
 */
export function readStoredBroken(): readonly BreakableId[] {
  try {
    const raw = sessionStorage.getItem(BROKEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isBreakableId) : [];
  } catch {
    return [];
  }
}

function rememberBroken(ids: readonly BreakableId[]) {
  try {
    sessionStorage.setItem(BROKEN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* No storage required. */
  }
}

export const mountBreakables = (_dispatch: Dispatch, _initial: World): Painter => {
  const elements = new Map<BreakableId, HTMLElement[]>(
    BREAKABLE_IDS.map(id => [id, [...document.querySelectorAll<HTMLElement>(`[data-breakable="${id}"]`)]]),
  );
  const painted = new Map<BreakableId, 'intact' | 'broken'>();

  return (world: World) => {
    let changed = false;
    for (const id of BREAKABLE_IDS) {
      const state = breakableState(world, id);
      if (painted.get(id) === state) continue;
      changed = true;
      painted.set(id, state);
      for (const element of elements.get(id)!) element.hidden = element.dataset.breakableState !== state;
    }
    if (changed) rememberBroken(BREAKABLE_IDS.filter(id => breakableState(world, id) === 'broken'));
  };
};
