// 44: a Room's arrival
import {
  ROOM_IDS,
  isInteractive,
  roomArrivalSfx,
  roomArrivalState,
  roomDoorState,
  type ArrivalState,
  type DoorState,
  type RoomId,
  type World,
} from '../world';
import { type Dispatch, type Painter } from './painter';
import { playSfx } from './sound';

/**
 * Paint every Room's Door, and report the input that ends its arrival.
 *
 * Both halves of this file are the DOM layer doing what it is for. The Door's
 * state is the model's answer — `src/world/arrival.ts` folds it out of the
 * entrance's clock — and all that happens here is writing it onto the Room's
 * stage for the stylesheet to swing a leaf on. The interruption is the other
 * direction: a click, a tap or a key press is reported as having happened, and
 * the model is what decides it means the entrance is over.
 *
 * The Cast is painted by `src/dom/actors.ts` like any other Actor, because an
 * Actor walking in through a door is just an Actor walking.
 */

/** How long after the apartment opens the Door of a Room opened on swings. */
const DOORSTEP_MS = 400;

export const mountArrival = (dispatch: Dispatch): Painter => {
  /**
   * Any input at all, whatever it was aimed at.
   *
   * Not removed after the first one, unlike the sound painter's gate: a Room's
   * entrance plays on every entry, so every entry has its own interruption to
   * listen for. `pointerdown` and `keydown` both land before the click or the
   * activation they belong to, so the Room is settled by the time whatever the
   * visitor was reaching for happens.
   */
  const interrupt = () => dispatch({ type: 'visitor-input' });
  addEventListener('pointerdown', interrupt, { passive: true });
  addEventListener('keydown', interrupt);

  const stages = new Map<RoomId, HTMLElement>(
    ROOM_IDS.flatMap(room => {
      const stage = document.querySelector<HTMLElement>(`[data-stage="${room}"]`);
      return stage ? ([[room, stage]] as ReadonlyArray<[RoomId, HTMLElement]>) : [];
    }),
  );

  /**
   * How far outside the viewport still counts as on the screen.
   *
   * The same margin the Cast's own frame clock uses in `src/dom/actors.ts`, so
   * the two agree about what being on the screen means.
   */
  const MARGIN_PX = 80;

  /** Is this Room's stage where the visitor can see it right now? */
  function onTheScreen(room: RoomId): boolean {
    const stage = stages.get(room);
    if (!stage) return false;
    const box = stage.getBoundingClientRect();
    return box.width > 0 && box.bottom > -MARGIN_PX && box.top < innerHeight + MARGIN_PX;
  }

  /**
   * Report a Room whose stage has left the screen.
   *
   * The other half of what only the browser knows. `src/dom/actors.ts` stops
   * the frame clock for a stage that has scrolled away, which is the motion
   * convention working — but an entrance is a script with a deadline rather
   * than an animation, and one left frozen half way is a Room with an open
   * Door and nobody in it. So the page says the stage is not on the screen and
   * the model decides that the entrance is over.
   *
   * This catches the visitor who scrolls off mid-entrance. The Room that is
   * below the fold the moment it is walked into never crosses the observer at
   * all — it was off the screen before and is off it still — which is what the
   * check in the painter below is for. Both name their Room, so the stage of
   * the Room being walked out of cannot settle the entrance of the one being
   * walked into.
   */
  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) continue;
          const room = (entry.target as HTMLElement).dataset.stage as RoomId;
          dispatch({ type: 'room-unwatched', room });
        }
      },
      // The same margin the Cast's own clock uses, so the two agree about what
      // counts as being on the screen.
      { rootMargin: `${MARGIN_PX}px`, threshold: 0 },
    );
    for (const stage of stages.values()) watcher.observe(stage);
  }

  /**
   * Ask for the entrance once the apartment has opened on this Room.
   *
   * Only ever for a page that opened on a Room rather than in the Entryway:
   * walking through a Door starts the entrance by itself, and the Entryway's
   * own arrival is `src/dom/entryway.ts`'s to ask for. The wait is the page's
   * to keep, because the model may not hold a timer.
   */
  let knocked = false;
  function openTheDoor(world: World) {
    if (knocked || !isInteractive(world) || roomArrivalState(world) !== 'pending') return;
    knocked = true;
    setTimeout(() => dispatch({ type: 'arrival-started' }), DOORSTEP_MS);
  }

  const painted = new Map<RoomId, DoorState>();
  let last: ArrivalState | null = null;
  return (world: World) => {
    // Sounds are edge-triggered: they name what the last tick crossed, so they
    // are played before anything below can decide the paint is unchanged.
    for (const name of roomArrivalSfx(world)) playSfx(name);
    openTheDoor(world);

    const state = roomArrivalState(world);
    const begun = state === 'playing' && last !== 'playing';
    last = state;
    // The Room was walked into below the fold: the Game Room's stage sits a
    // thousand pixels under its deck at desktop widths. Reported on the paint
    // the entrance begins on rather than on a frame of it, so the leaf never
    // starts a swing it has to take back. The report paints the Room again on
    // its way through, which is why there is nothing left to do here.
    if (begun && !onTheScreen(world.rooms.current)) {
      dispatch({ type: 'room-unwatched', room: world.rooms.current });
      return;
    }

    for (const [room, stage] of stages) {
      const door = roomDoorState(world, room);
      if (painted.get(room) === door) continue;
      painted.set(room, door);
      stage.dataset.door = door;
    }
  };
};
