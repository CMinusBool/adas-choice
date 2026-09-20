/**
 * The Game Room's three Portals, and what the visitor is doing with them.
 *
 * A Portal is an aperture cut through the back wall into one game's world
 * (`docs/adr/0004`, design note 11 §5.4). Two things about it are decisions
 * rather than drawing, so both live here:
 *
 *  - **Which one is awake.** At rest every world holds still; the one the
 *    visitor comes near plays. Hover and focus are the same report, because
 *    they are the same thing happening — the visitor is at that Portal.
 *  - **Which one the wall is showing.** Below 1080 px a Portal is 165 px wide
 *    and three of them buy nothing (§3.5), so the wall carries one at a time
 *    and the three dots, the arrow keys and a tap on a dot all move it.
 *
 * The narrow wall's answer is kept at every width rather than only below the
 * breakpoint: a breakpoint is the page's business, and the model has no way to
 * ask about one.
 */
export type PortalId = 'tango' | 'lovers' | 'heavenly';

/** The three games, left to right across the wall. */
export const PORTAL_IDS: readonly PortalId[] = ['tango', 'lovers', 'heavenly'];

/** Which Portal the visitor is at, and which one the wall is showing. */
export interface PortalsSlice {
  /**
   * The Portal the visitor's pointer or focus is on, or `null` for none.
   *
   * Only ever one: a Portal wakes by being approached, and the visitor can
   * only be at one place on the wall.
   */
  readonly attended: PortalId | null;
  /**
   * The Portal a narrow wall has room for. Always one of the three.
   *
   * Never `null`: the wall is never empty, and the wide layout simply ignores
   * this and shows all three.
   */
  readonly current: PortalId;
}

/** The wall as the visitor finds it: at rest, on the first of the three. */
export function createPortals(): PortalsSlice {
  return { attended: null, current: PORTAL_IDS[0] };
}

/** The wall after the visitor comes near a Portal, or looks away from one. */
export function withPortalAttended(portals: PortalsSlice, portal: PortalId | null): PortalsSlice {
  return portals.attended === portal ? portals : { ...portals, attended: portal };
}

/**
 * The wall after a narrow layout is asked for a different Portal.
 *
 * The arriving Portal is at rest, whatever the leaving one was doing: nothing
 * is near it yet, and a world that starts playing because the wall moved would
 * be playing at nobody.
 */
export function withPortalChosen(portals: PortalsSlice, portal: PortalId): PortalsSlice {
  if (portals.current === portal && portals.attended === null) return portals;
  return { attended: null, current: portal };
}

/**
 * The wall one Portal along, in either direction.
 *
 * The three are a ring rather than a queue: an arrow key at either end comes
 * round to the other, which is what the three dots say the wall is.
 */
export function steppedPortal(portals: PortalsSlice, step: number): PortalsSlice {
  const at = PORTAL_IDS.indexOf(portals.current);
  const count = PORTAL_IDS.length;
  const next = PORTAL_IDS[(((at + step) % count) + count) % count];
  return withPortalChosen(portals, next);
}
