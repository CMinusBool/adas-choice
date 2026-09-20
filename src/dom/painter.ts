import type { World, WorldEvent } from '../world';

/**
 * The contract between the world model and the page.
 *
 * A painter is handed the world and makes the page look like it. It decides
 * nothing: anything it learns from the browser it reports back as a
 * `WorldEvent` and waits to be painted again.
 *
 * Every slice of the world gets its own painter file, mounted once in
 * `src/main.ts` and re-run on every change. A new slice — the loading screen,
 * the audio tiers — is a new file and one more line in that list, rather than
 * another branch inside an existing painter.
 */
export type Dispatch = (event: WorldEvent) => void;

export type Painter = (world: World) => void;

/**
 * Mount a painter: wire the page's listeners once, hand back the painter.
 *
 * `initial` is the world as it stands at mount time, for the rare painter that
 * has to read it before the first paint.
 */
export type Mount = (dispatch: Dispatch, initial: World) => Painter;

/**
 * The shell's one layout boundary, as `styles.css` writes it.
 *
 * The page turns wide at 1080 px, and two painters have to know when it has:
 * the Game Room, whose wall carries one Portal below it and three above, and
 * the Activity Room's scrim. One string, so a breakpoint moved in the
 * stylesheet is moved in one place on this side of it too.
 */
export const WIDE_LAYOUT = '(min-width: 1080px)';

/** `index.html` guarantees these ids, so a miss is a bug rather than a state. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
