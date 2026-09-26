import { ROOM_IDS, isCanonicalHash, isCurrentRoom, isInteractive, isRoomPainted, parseRoute, roomHash, type RoomId, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

/** Longer than the entering Room's animation, short enough not to strand it. */
const TRANSITION_GUARD_MS = 1200;

/**
 * Move the visitor between Rooms.
 *
 * Navigation is the browser's: doors are ordinary `<a href="#/cinema">` links,
 * so the back button walks back through the Rooms already visited without the
 * page ever managing a history stack. All this painter does is report the hash
 * and paint whichever Rooms the model says are standing.
 */
export const mountRooms = (dispatch: Dispatch): Painter => {
  const apartment = byId('apartment');
  const elements = new Map<RoomId, HTMLElement>(
    ROOM_IDS.map(room => [room, apartment.querySelector<HTMLElement>(`[data-room="${room}"]`)!]),
  );

  // A hash we cannot read is rewritten rather than pushed, so a mistyped route
  // does not sit in history waiting for the back button to find it again.
  if (!isCanonicalHash(location.hash)) location.replace(roomHash(parseRoute(location.hash)));

  const titleOf = (room: RoomId) => elements.get(room)!.querySelector<HTMLElement>('[data-room-title]')!;

  // 101: and so is one typed while the visitor is already here — in the bar or
  // by the page itself. `location.replace` swaps the junk entry for the Room it
  // reads as, so history keeps only the Rooms actually walked through. Never
  // `pushState` (ADR 0001).
  addEventListener('hashchange', () => {
    if (isCanonicalHash(location.hash)) {
      dispatch({ type: 'hash-changed', hash: location.hash });
      return;
    }
    const room = parseRoute(location.hash);
    location.replace(roomHash(room));
    dispatch({ type: 'hash-changed', hash: roomHash(room) });
    // Junk read as the Room the visitor is already in moves nobody, so nothing
    // else will hand the Room its focus back: the arrival rule applies anyway.
    if (room === current) titleOf(room).focus({ preventScroll: true });
  });

  // The skip link jumps within the Room the visitor is in; letting it write a
  // hash would read as an unknown route and move them somewhere else entirely.
  document.querySelector<HTMLAnchorElement>('.skip-link')!.addEventListener('click', event => {
    event.preventDefault();
    if (current) titleOf(current).focus();
  });

  let current: RoomId | null = null;
  let settling = 0;
  let stopWaiting: (() => void) | null = null;
  // 05: loading
  let opened = false;

  return (world: World) => {
    const { transition } = world.rooms;
    // 05: loading — the apartment opening is an arrival too: the loading screen
    // held focus while the shell was inert, so the Room the visitor is standing
    // in has to take it once the screen goes.
    const opening = isInteractive(world) && !opened;
    opened ||= opening;
    for (const room of ROOM_IDS) {
      const element = elements.get(room)!;
      const entered = isCurrentRoom(world, room);
      const leaving = !entered && isRoomPainted(world, room);
      element.classList.toggle('is-leaving', leaving);
      element.classList.toggle('is-entering', entered && transition === 'animated');
      // A Room on its way out keeps its place on screen but not in the tab
      // order: the Game Room's controls must not be reachable from elsewhere.
      element.inert = leaving;
      element.hidden = !isRoomPainted(world, room);
    }

    if (current !== world.rooms.current || opening) {
      const arriving = current !== null;
      current = world.rooms.current;
      if (arriving) {
        // The door that was just used is inside a Room now hidden, so focus has
        // to go somewhere: the heading of the Room the visitor walked into.
        titleOf(current).focus({ preventScroll: true });
        scrollTo({ top: 0 });
      }
    }

    stopWaiting?.();
    stopWaiting = null;
    if (transition === 'settled') return;

    const token = ++settling;
    const settle = () => {
      if (token === settling) dispatch({ type: 'room-transition-finished' });
    };
    if (transition === 'animated') {
      // Waiting for the animation is only safe because the model already ruled
      // out the case where there is no animation to wait for. We wait on the
      // Room arriving, not the one leaving: it is the last thing still moving,
      // and it is the element we know is there.
      const entering = elements.get(world.rooms.current)!;
      const finished = (event: AnimationEvent) => {
        if (event.target !== entering || event.animationName !== 'room-enter') return;
        settle();
      };
      entering.addEventListener('animationend', finished);
      // A Room that never reports its animation must not be stranded half-left.
      const guard = setTimeout(settle, TRANSITION_GUARD_MS);
      stopWaiting = () => {
        entering.removeEventListener('animationend', finished);
        clearTimeout(guard);
      };
    } else {
      // Settle after this paint rather than during it, so the world does not
      // change underneath the painters still to run.
      queueMicrotask(settle);
    }
  };
};
