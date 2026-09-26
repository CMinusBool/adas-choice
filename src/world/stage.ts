import type { RoomId } from './rooms';

/**
 * The stage: the logical space every Room is laid out in.
 *
 * A Room's stage is a 16:9 canvas in units, with its origin at the top-left, x
 * to the right and y downward. How many units across it is belongs to the Room,
 * in `STAGES`; the unit itself is the same in every Room (the Boy is 300 of them
 * to the crown), so a bigger Room is more units across, not bigger units.
 * Walkable areas, Props, doors and Actor positions are all expressed in these
 * units, so the same numbers mean the same place at every screen width — the DOM
 * layer only ever turns them into percentages of the Room's own width and
 * height. An Actor's position is its feet point, the bottom-centre of its sprite,
 * which is also what makes depth a y-sort.
 *
 * Everything below is plain geometry — no Actor, no time — but for the stage
 * table and the one speed the Cast and the cats both reckon distances with.
 */

/** A stage's size in units: exactly 16:9, in whole units. */
export interface StageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Every Room's stage, keyed by Room id (81, design 75 §2.1).
 *
 * Every Room stood on a 1600 x 900 stage until the Room tickets put each one at
 * true size, and each of those changes only its entry here: 86 put the Entryway
 * on 1184 x 666, the size its edited backdrop takes when its painted doors come
 * to the one door (design 75 §2.1, s = 0.74). Two things outside the model repeat these numbers and
 * are held to them by `scripts/check-stages.test.mjs`: each stage's
 * `--stage-w` / `--stage-h` in `styles.css`, which is what turns units into
 * percentages there, and each Room's backdrop — its box in `index.html` and the
 * `stage` its manifest entry is stretched to.
 */
export const STAGES: Readonly<Record<RoomId, StageSize>> = {
  entryway: { width: 1184, height: 666 },
  games: { width: 1600, height: 900 },
  cinema: { width: 1600, height: 900 },
  activities: { width: 1600, height: 900 },
};

/**
 * How fast a walk carries anybody across the stage, in stage units per second.
 *
 * The walk Cycle's speed in `actors.ts`, and the speed a cat in `cats.ts`
 * reckons her walk to a knock at. It lives here because both of them import
 * this file and `actors.ts` imports `cats.ts`, so neither could take it from the
 * other.
 */
export const WALK_SPEED = 190;

/** A place on a stage, in stage units. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A closed simple polygon, given as its corners in order.
 *
 * The closing edge from the last corner back to the first is implied. Simple
 * means the edges do not cross each other; the polygon may be concave, which is
 * the whole reason routes need computing rather than drawing straight.
 */
export type Polygon = readonly Point[];

/**
 * Slack for "on the line", in stage units.
 *
 * Big enough to absorb the floating-point error of walking a route corner to
 * corner, small enough to be a fraction of a pixel on any real screen.
 */
const EPSILON = 1e-6;

/** How far inside a corner a route is allowed to cut, in stage units. */
const CORNER_CLEARANCE = 1.5;

export function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** The point on a segment closest to `point`, and how far away it is. */
function closestOnSegment(point: Point, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return from;
  const along = Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return { x: from.x + along * dx, y: from.y + along * dy };
}

/**
 * Is this point inside the polygon, or on its edge?
 *
 * Ray casting, with the boundary counted as inside: a route that runs along a
 * wall or turns exactly on a corner is walking the edge of the floor, not off
 * it, and rejecting that would make every corner unreachable.
 */
export function containsPoint(polygon: Polygon, point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous];
    const b = polygon[index];
    if (distance(point, closestOnSegment(point, a, b)) <= EPSILON) return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
      const crossingX = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (point.x < crossingX) inside = !inside;
    }
  }
  return inside;
}

/** The nearest point of the polygon to one outside it; the point itself if inside. */
export function clampInto(polygon: Polygon, point: Point): Point {
  if (containsPoint(polygon, point)) return point;
  let best = polygon[0];
  let bestDistance = Infinity;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const candidate = closestOnSegment(point, polygon[previous], polygon[index]);
    const away = distance(point, candidate);
    if (away < bestDistance) {
      bestDistance = away;
      best = candidate;
    }
  }
  return best;
}

/** Where along `a → b` (as a fraction) it meets the segment `p → q`. */
function meetingPoints(a: Point, b: Point, p: Point, q: Point): number[] {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = q.x - p.x;
  const sy = q.y - p.y;
  const px = p.x - a.x;
  const py = p.y - a.y;
  const denominator = cross(rx, ry, sx, sy);
  const held = (value: number) => value >= -EPSILON && value <= 1 + EPSILON;
  if (Math.abs(denominator) < EPSILON) {
    // Parallel. Only a collinear overlap touches, and then it touches all along.
    if (Math.abs(cross(px, py, rx, ry)) > EPSILON) return [];
    const lengthSquared = rx * rx + ry * ry;
    if (lengthSquared < EPSILON) return [];
    const start = (px * rx + py * ry) / lengthSquared;
    return [start, start + (sx * rx + sy * ry) / lengthSquared].filter(held);
  }
  const alongSegment = cross(px, py, sx, sy) / denominator;
  const alongEdge = cross(px, py, rx, ry) / denominator;
  return held(alongSegment) && held(alongEdge) ? [alongSegment] : [];
}

/**
 * Does the whole straight line from `a` to `b` stay inside the polygon?
 *
 * Cut the line at every point where it meets the boundary, then ask whether the
 * middle of each piece is inside. Both endpoints being inside is not enough: a
 * line between two corners of a concave floor can leave through the gap between
 * them and come back, and that is exactly the case routes exist to avoid.
 */
export function segmentInside(polygon: Polygon, a: Point, b: Point): boolean {
  if (!containsPoint(polygon, a) || !containsPoint(polygon, b)) return false;
  const cuts = [0, 1];
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    cuts.push(...meetingPoints(a, b, polygon[previous], polygon[index]));
  }
  cuts.sort((first, second) => first - second);
  for (let index = 1; index < cuts.length; index++) {
    const middle = (cuts[index - 1] + cuts[index]) / 2;
    if (middle <= 0 || middle >= 1) continue;
    if (!containsPoint(polygon, { x: a.x + (b.x - a.x) * middle, y: a.y + (b.y - a.y) * middle })) return false;
  }
  return true;
}

/**
 * The polygon's corners, nudged just inside it.
 *
 * A route that turns exactly on a corner is walking the very edge of the floor,
 * which is legal but leaves nothing for rounding to give away. Turning a whisker
 * inside costs nothing visible and keeps every reported position comfortably
 * within the walkable area.
 */
function turningPoints(polygon: Polygon): Point[] {
  return polygon.map((corner, index) => {
    const before = polygon[(index + polygon.length - 1) % polygon.length];
    const after = polygon[(index + 1) % polygon.length];
    const toBefore = distance(corner, before);
    const toAfter = distance(corner, after);
    if (toBefore < EPSILON || toAfter < EPSILON) return corner;
    const dx = (before.x - corner.x) / toBefore + (after.x - corner.x) / toAfter;
    const dy = (before.y - corner.y) / toBefore + (after.y - corner.y) / toAfter;
    const length = Math.hypot(dx, dy);
    if (length < EPSILON) return corner;
    const step = { x: (dx / length) * CORNER_CLEARANCE, y: (dy / length) * CORNER_CLEARANCE };
    // The bisector points into the floor at an outer corner and out of it at an
    // inner one, so try both ways round and keep whichever landed inside.
    const inward = { x: corner.x + step.x, y: corner.y + step.y };
    if (containsPoint(polygon, inward)) return inward;
    const outward = { x: corner.x - step.x, y: corner.y - step.y };
    return containsPoint(polygon, outward) ? outward : corner;
  });
}

/**
 * The waypoints an Actor walks to get from `from` to `goal` without leaving the
 * polygon: a straight line when it can, corners when it cannot.
 *
 * The answer never includes `from` and always ends at `goal`, so it is a list of
 * places to walk to in order, and an empty list means "you are already there".
 * A goal outside the polygon is clamped to the nearest walkable point rather
 * than refused, so a badly aimed destination still produces a sensible walk.
 *
 * The shortest such path only ever turns at a corner of the polygon, so the
 * whole search is: build the corners the line of sight can reach, then take the
 * cheapest chain of them. Ten-odd corners per Room makes that free.
 */
export function routeThrough(polygon: Polygon, from: Point, goal: Point): readonly Point[] {
  const start = clampInto(polygon, from);
  const end = clampInto(polygon, goal);
  if (distance(start, end) <= EPSILON) return [];
  if (segmentInside(polygon, start, end)) return [end];

  const nodes = [start, ...turningPoints(polygon), end];
  const target = nodes.length - 1;
  const cost = nodes.map(() => Infinity);
  const cameFrom = nodes.map(() => -1);
  const settled = nodes.map(() => false);
  cost[0] = 0;

  for (;;) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++) {
      if (!settled[index] && cost[index] < (current === -1 ? Infinity : cost[current])) current = index;
    }
    if (current === -1 || current === target) break;
    settled[current] = true;
    for (let next = 0; next < nodes.length; next++) {
      if (settled[next] || next === current) continue;
      const step = distance(nodes[current], nodes[next]);
      if (cost[current] + step >= cost[next]) continue;
      if (!segmentInside(polygon, nodes[current], nodes[next])) continue;
      cost[next] = cost[current] + step;
      cameFrom[next] = current;
    }
  }

  if (cost[target] === Infinity) return [];
  const route: Point[] = [];
  for (let node = target; node > 0; node = cameFrom[node]) route.unshift(nodes[node]);
  return route;
}

/** How far it is to walk `from` through every waypoint in order. */
export function routeLength(from: Point, route: readonly Point[]): number {
  let total = 0;
  let at = from;
  for (const waypoint of route) {
    total += distance(at, waypoint);
    at = waypoint;
  }
  return total;
}
