// 44: a Room's arrival
import {
  ROOM_IDS,
  isInteractive,
  roomArrivalSfx,
  roomArrivalState,
  roomDoorState,
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
  return (world: World) => {
    // Sounds are edge-triggered: they name what the last tick crossed, so they
    // are played before anything below can decide the paint is unchanged.
    for (const name of roomArrivalSfx(world)) playSfx(name);
    openTheDoor(world);
    for (const [room, stage] of stages) {
      const door = roomDoorState(world, room);
      if (painted.get(room) === door) continue;
      painted.set(room, door);
      stage.dataset.door = door;
    }
  };
};
