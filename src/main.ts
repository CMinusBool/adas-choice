import { mountActivityRoom } from './dom/activity-room'; // 16: the Activity Room
import { mountActors } from './dom/actors'; // 07: actors
import { mountArrival } from './dom/arrival'; // 44: every Room's own entrance
import { paintDeclaredArtwork } from './dom/artwork'; // 53: a Prop's surface, from the Prop
import { mountBreakables, readStoredBroken } from './dom/breakables'; // 09: the Breakables
import { mountCats } from './dom/cats'; // 08: the cats
import { mountCinemaRoom } from './dom/cinema-room'; // 17: the Cinema Room
import { mountEntryway, readStoredArrival } from './dom/entryway'; // 14: the Entryway
import { mountGameRoom } from './dom/game-room'; // 15, 45: the Game Room
import { mountInvitation } from './dom/invitation'; // 108: the Invitation, from the Game Room and the Cinema
import { mountLanguage, readStoredLanguage } from './dom/language';
// 05: loading
import { mountLoading } from './dom/loading';
import { mountMotion, prefersReducedMotion } from './dom/motion';
import { mountRooms } from './dom/rooms';
import { mountSeats } from './dom/seats'; // 34: the seated stills
import { mountSound } from './dom/sound'; // 06: audio
import type { Mount, Painter } from './dom/painter';
import { advance, createWorld, seededRandom, type World, type WorldEvent } from './world';

/**
 * The DOM layer's composition root.
 *
 * The world is built once from what only the browser knows, and from then on it
 * only ever changes through `advance`. Painters are mounted in order and re-run
 * on every change; a new one — the loading screen, the audio tiers — is a new
 * file and one more entry in this list.
 */
// 68: `?seed=N` replays one afternoon, so a harness can say when a Breakable
// falls. 70: without one, the dice are seeded from the clock, so every page load
// rolls its own afternoon — whether each Breakable falls, and when. The model
// never reads the URL or the clock itself; it is handed the seed's stream.
const askedSeed = new URLSearchParams(location.search).get('seed');
const seed = askedSeed !== null && /^\d+$/.test(askedSeed) ? Number(askedSeed) : Date.now();

let world: World = createWorld({
  hash: location.hash,
  random: seededRandom(seed),
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
  mountLanguage, mountMotion, mountRooms,
  mountInvitation, // 108: before the two Rooms that open it
  mountGameRoom,
  mountCinemaRoom, // 17: the Cinema Room's bookshelves
  mountActivityRoom, // 16: the Activity Room
  mountSound, // 06: audio
  // 44: after the sound painter, because the Door's own sounds go out through
  // `playSfx` and that painter is what hands the module the world to ask.
  mountArrival,
  mountActors, // 07: actors — the Cast stands on top of whatever the Room laid down.
  mountSeats, // 34: a seated still stands in for a sprite the painter above has placed.
  // 08: the cats slice, after the Cast, because the petting Beat stands in for
  // a cat the painter above has just placed and takes its box from her.
  mountCats,
  // 14: the Entryway, after the Cast, because the arrival's Beats stand in for
  // Actors the painter above has just placed.
  mountEntryway,
  mountBreakables, // 09: the other four Breakables
];
// 53: every Prop's surface, taken from the `data-still` it declares, before the
// first painter runs. Not in the list below, because it is not a painter: a
// surface is the same file whatever the world is doing, and declaring it in the
// markup rather than the stylesheet is what puts it in the loading gate's list.
paintDeclaredArtwork();

// Filled as each painter mounts, so an event arriving mid-mount paints only
// what is already standing instead of reaching for a painter that is not there.
const painters: Painter[] = [];

function render() {
  for (const paint of painters) paint(world);
}

for (const mount of mounts) painters.push(mount(dispatch, world));

render();
