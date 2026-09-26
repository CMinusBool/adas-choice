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
 *
 * 86: on the 1184 x 666 stage (design 75 §4.2). `T`, `EMira`, `ELuna` and `K`
 * are §4.2's. `GS` and `BS` are not: §4.2 stood the pair in front of the
 * whole bench, which hid the backpack on its seat, so they stand either side
 * of it instead, turned to each other across it, and he is far enough forward
 * that his head clears the Game Room's plaque; `EMica` is 29 units left of
 * §4.2's, clear of her. The marks a Beat takes an Actor from or hands it back
 * at are where that Beat's own frames put the figure's feet, measured off
 * the sheets, because a Beat is drawn at a fixed place inside its frame and the
 * closing rule is that no hand-off moves the feet more than 6 units:
 * - `B1`, where he walks to: S15's first frame (backpack down).
 * - `B2`, where S15's last frame leaves him and S16 (the duet) takes him.
 * - `B3`, where S16 leaves him and S17 (her coat onto hook 2) takes him.
 * - `B4`, where S18 (his parka onto hook 1) leaves him, before he walks to `BS`.
 * - `G1`, where she walks to: S16's first frame, a step to his right.
 * - `G1b`, where S16 leaves her, coat off, before she walks to `G2`.
 * - `G2`, where she kneels (S19), with her first and last frames' feet 4.6
 *   units either side of it.
 * The whole chain is placed from one thing: S18's seventh frame holds the
 * parka's collar on hook 1's tip, lowered 4.8 units so that `B4` stands on the
 * floor.
 */
export const ENTRYWAY_MARKS = {
  T: { x: 117, y: 426 },
  B1: { x: 350.7, y: 496.2 },
  B2: { x: 334.4, y: 475.5 },
  B3: { x: 326.7, y: 462.8 },
  B4: { x: 309.7, y: 449.5 },
  G1: { x: 432, y: 476.1 },
  G1b: { x: 429, y: 463.5 },
  G2: { x: 300, y: 482 },
  EMica: { x: 150, y: 505 },
  EMira: { x: 309, y: 549 },
  ELuna: { x: 466, y: 599 },
  GS: { x: 250, y: 540 },
  BS: { x: 420, y: 565 },
  K: { x: 698, y: 491 },
} as const satisfies Record<string, Point>;

/**
 * The floor of the hallway (§3.2, 86: design 75 §4.2).
 *
 * A band across the front of the Room from the floor line's first 33 units
 * down to the runner's front edge, with a tongue at the left for the doorway
 * and the mat — so an Actor can stand in the door — and a right-hand end at
 * x 1060, short of the painted monstera, so no Actor stands over its leaves.
 * Concave on purpose: crossing the hall from the doorway is a route that has
 * to bend rather than a straight line, which is what keeps the route finder
 * honest.
 */
export const ENTRYWAY_WALKABLE: Polygon = [
  { x: 69, y: 419 },
  { x: 197, y: 419 },
  { x: 197, y: 449 },
  { x: 1060, y: 449 },
  { x: 1060, y: 633 },
  { x: 69, y: 633 },
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
  readonly frontDoor: 'closed' | 'opening' | 'open' | 'closing';
  /** The pet backpack: off-stage on the Boy's back, then on the bench. */
  readonly backpack: 'carried' | 'closed' | 'open';
  /** The Girl's plum coat: on her, then on hook 2. */
  readonly girlCoat: 'worn' | 'hung';
  /** The Boy's olive parka: on him, then on hook 1, over hers. */
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

/**
 * The Room's Breakable: the vase of dried grasses on the hall table (§4.2).
 *
 * Míca's alone — Mira's Breakable is the Cinema Room's and Luna's is the Game
 * Room's — and the visitor cannot break it themselves.
 */
export type VaseState = 'intact' | 'broken';
