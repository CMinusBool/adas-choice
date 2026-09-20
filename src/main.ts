import { mountActivityRoom } from './dom/activity-room'; // 16: the Activity Room
import { mountActors } from './dom/actors'; // 07: actors
import { mountBreakables, readStoredBroken } from './dom/breakables'; // 09: the Breakables
import { mountCinemaRoom } from './dom/cinema-room'; // 17: the Cinema Room
import { mountEntryway, readStoredArrival } from './dom/entryway'; // 14: the Entryway
import { mountGameRoom } from './dom/game-room';
import { mountGameStage } from './dom/game-stage'; // 15: the Game Room's wall unit
import { mountLanguage, readStoredLanguage } from './dom/language';
// 05: loading
import { mountLoading } from './dom/loading';
import { mountMotion, prefersReducedMotion } from './dom/motion';
import { mountRooms } from './dom/rooms';
import { mountSound } from './dom/sound'; // 06: audio
import type { Mount, Painter } from './dom/painter';
import { advance, createWorld, type World, type WorldEvent } from './world';

/**
 * The DOM layer's composition root.
 *
 * The world is built once from what only the browser knows, and from then on it
 * only ever changes through `advance`. Painters are mounted in order and re-run
 * on every change; a new one — the loading screen, the audio tiers — is a new
 * file and one more entry in this list.
 */
let world: World = createWorld({
  hash: location.hash,
  storedLanguage: readStoredLanguage(),
  reducedMotion: prefersReducedMotion(),
  arrived: readStoredArrival(), // 14: the Entryway
  brokenBreakables: readStoredBroken(), // 09: the Breakables
});

function dispatch(event: WorldEvent) {
  const next = advance(world, event);
  // `advance` hands back the same world when nothing changed, so a hash we
  // wrote ourselves, or an event that means nothing here, costs no repaint.
  if (next === world) return;
  world = next;
  render();
}

const mounts: Mount[] = [
  // 05: loading — first in the list, so that on the paint where the apartment
  // opens the shell is out of `inert` before the Room router moves focus into it.
  mountLoading,
  mountLanguage, mountMotion, mountRooms, mountGameRoom,
  // 15: after the Game Room's own painter, because it rehouses the deck that
  // painter has already taken hold of.
  mountGameStage,
  mountCinemaRoom, // 17: the Cinema Room's bookshelves
  mountActivityRoom, // 16: the Activity Room
  mountSound, // 06: audio
  mountActors, // 07: actors — the Cast stands on top of whatever the Room laid down.
  // 14: the Entryway, after the Cast, because the arrival's Beats stand in for
  // Actors the painter above has just placed.
  mountEntryway,
  mountBreakables, // 09: the other four Breakables
];
// Filled as each painter mounts, so an event arriving mid-mount paints only
// what is already standing instead of reaching for a painter that is not there.
const painters: Painter[] = [];

function render() {
  for (const paint of painters) paint(world);
}

for (const mount of mounts) painters.push(mount(dispatch, world));

render();
