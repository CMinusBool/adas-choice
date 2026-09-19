// 14: the Entryway
import type { Point, Polygon } from './stage';

/**
 * The Entryway's fixed geometry, in stage units.
 *
 * Design note `design/10-entryway.md` §3 is the source of every number here,
 * and this file is the only place any of them is written down: the world model
 * routes the Cast between these marks, and the DOM layer turns the same numbers
 * into percentages of the stage. A hallway is a place rather than a menu, so the
 * marks are where people actually stand in it — the feet point, bottom-centre
 * of the sprite, as everywhere else on a stage.
 *
 * Pure geometry: nothing here knows about an Actor, a Room or the clock.
 */

/**
 * Where the Cast stands, by the design note's own names (§3.3).
 *
 * `T` is the threshold, on the mat inside the open front door; `G`/`B` marks are
 * the Girl's and the Boy's; `E-` marks are where each cat lands when it climbs
 * out of the backpack; `GS`/`BS` are the settled tableau; `K` is Míca's mark by
 * the hall table, where the vase is knocked from.
 */
export const ENTRYWAY_MARKS = {
  T: { x: 170, y: 612 },
  G1: { x: 500, y: 690 },
  B1: { x: 432, y: 684 },
  G2: { x: 355, y: 728 },
  EMica: { x: 270, y: 705 },
  EMira: { x: 480, y: 760 },
  ELuna: { x: 700, y: 820 },
  GS: { x: 420, y: 736 },
  BS: { x: 540, y: 724 },
  K: { x: 1040, y: 690 },
} as const satisfies Record<string, Point>;

/**
 * The floor of the hallway (§3.2).
 *
 * A band across the front of the Room, with a tongue at the left for the
 * doorway and the mat — so an Actor can stand in the door — and a notch at the
 * right that keeps feet out of the monstera's pot. Concave on purpose: crossing
 * the hall from the doorway is a route that has to bend rather than a straight
 * line, which is what keeps the route finder honest.
 */
export const ENTRYWAY_WALKABLE: Polygon = [
  { x: 100, y: 604 },
  { x: 300, y: 604 },
  { x: 300, y: 640 },
  { x: 1500, y: 640 },
  { x: 1500, y: 780 },
  { x: 1470, y: 780 },
  { x: 1470, y: 860 },
  { x: 100, y: 860 },
];

/**
 * The Props that change state, and what states each of them has (§4, §5.2).
 *
 * The world model owns which state a Prop is in; the artwork behind each state
 * is the DOM layer's business and, until ticket 33, is a placeholder. The vase
 * is the Room's Breakable and is therefore not part of the arrival: it changes
 * state when a cat knocks it down, which is ticket 09's decision to make.
 */
export interface EntrywayProps {
  /** The front door's leaf: the Cast comes in through it and it shuts itself. */
  readonly frontDoor: 'closed' | 'open';
  /** The pet backpack: off-stage on the Boy's back, then on the bench. */
  readonly backpack: 'carried' | 'closed' | 'open';
  /** The Girl's plum coat: on her, then on hook 450. */
  readonly girlCoat: 'worn' | 'hung';
  /** The Boy's olive parka: on him, then on hook 500 over hers. */
  readonly boyParka: 'worn' | 'hung';
}

/** Every Prop of the Entryway that has more than one state. */
export type EntrywayPropId = keyof EntrywayProps;

/** The Room before anyone has come through the door (§5.2, t 0). */
export const ENTRYWAY_PROPS_AT_REST: EntrywayProps = {
  frontDoor: 'closed',
  backpack: 'carried',
  girlCoat: 'worn',
  boyParka: 'worn',
};

/** The Room once the arrival is over — the settled tableau of §5.4. */
export const ENTRYWAY_PROPS_SETTLED: EntrywayProps = {
  frontDoor: 'closed',
  backpack: 'open',
  girlCoat: 'hung',
  boyParka: 'hung',
};

/**
 * The Room's Breakable: the vase of dried grasses on the hall table (§4.2).
 *
 * Míca's alone — Mira's Breakable is the Cinema Room's and Luna's is the Game
 * Room's — and the visitor cannot break it themselves.
 */
export type VaseState = 'intact' | 'broken';
