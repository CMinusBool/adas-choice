import {
  ENTRYWAY,
  arrivalView,
  entrywayProps,
  isCurrentRoom,
  isInteractive,
  motionIsOn,
  vaseState,
  type ActorId,
  type ArrivalView,
  type Box,
  type EntrywayProps,
  type VaseState,
  type World,
} from '../world';
import { type Dispatch, type Painter } from './painter';
import { playSfx } from './sound';

/**
 * Paint the Entryway: its Props, its Breakable, and the arrival.
 *
 * Every decision has already been made in `src/world/arrival.ts` — which Beat
 * is playing, which state each Prop is in, who is walking where, what should be
 * heard. This file only carries that out, and reports back the two things the
 * model cannot know for itself: when the apartment opened on this Room, and
 * whether this tab has already been shown the arrival.
 *
 * The Cast is painted by `src/dom/actors.ts` like any other, because an Actor
 * walking the hallway is just an Actor walking. All that is added here is the
 * costume it is walking in, as a `data-costume` for the artwork to hang off.
 */

/** Session storage remembers the arrival for this tab, and no longer. */
const ARRIVED_STORAGE_KEY = 'ada-arrived';

/**
 * How long after the apartment opens the Cast comes through the door.
 *
 * Design note §5.1: the visitor gets a beat of the empty hall before anything
 * moves in it, which is the shot the arrival opens on.
 */
const DOORSTEP_MS = 600;

/**
 * Has this tab already been shown the arrival?
 *
 * Read once, at start-up, and handed to the world as an input — the model never
 * asks the browser anything. Private browsing must stay usable, so a storage
 * that throws is a tab that has not seen it.
 */
export function readStoredArrival(): boolean {
  try {
    return sessionStorage.getItem(ARRIVED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberArrival() {
  try {
    sessionStorage.setItem(ARRIVED_STORAGE_KEY, 'true');
  } catch {
    /* No storage required. */
  }
}

/** Turn one stage-unit box into the custom properties the stylesheet reads. */
function place(element: HTMLElement, at: Box) {
  element.style.setProperty('--x', String(at.x));
  element.style.setProperty('--y', String(at.y));
  element.style.setProperty('--w', String(at.width));
  element.style.setProperty('--h', String(at.height));
  // A Beat sorts on its figure's feet, which is the bottom of its frame.
  element.style.setProperty('--z', String(Math.round(at.y + at.height)));
}

export const mountEntryway = (dispatch: Dispatch, initial: World): Painter => {
  const stage = document.querySelector<HTMLElement>(`[data-stage="${ENTRYWAY}"]`)!;
  const props = new Map<string, HTMLElement>(
    [...stage.querySelectorAll<HTMLElement>('[data-prop]')].map(element => [element.dataset.prop!, element]),
  );
  const beatLayers = new Map<string, HTMLElement>(
    [...stage.querySelectorAll<HTMLElement>('[data-beats] [data-beat]')].map(element => [
      element.dataset.beat!,
      element,
    ]),
  );
  const cast = new Map<ActorId, HTMLElement>(
    [...document.querySelectorAll<HTMLElement>('[data-actor]')].map(element => [
      element.dataset.actor as ActorId,
      element,
    ]),
  );

  let knocked = false;
  let world = initial;

  /**
   * Ask for the arrival once the apartment has opened on this Room.
   *
   * The wait is the page's to keep: the model is told that the arrival started
   * and takes its time from the ticks that follow, so no timer ever lives in it.
   */
  function openTheDoor() {
    if (knocked || arrivalView(world).state !== 'pending') return;
    if (!isInteractive(world) || !isCurrentRoom(world, ENTRYWAY) || !motionIsOn(world)) return;
    knocked = true;
    setTimeout(() => dispatch({ type: 'arrival-started' }), DOORSTEP_MS);
  }

  function showProps(states: EntrywayProps) {
    const door = props.get('frontDoor')!;
    door.classList.toggle('is-open', states.frontDoor === 'opening' || states.frontDoor === 'open');
    props.get('girlCoat')!.hidden = states.girlCoat !== 'hung';
    props.get('boyParka')!.hidden = states.boyParka !== 'hung';
    const backpack = props.get('backpack')!;
    backpack.hidden = states.backpack === 'carried';
    backpack.classList.toggle('is-open', states.backpack === 'open');
  }

  /**
   * Play whichever Beats the model has running, and say who they stand in for.
   *
   * A Beat with no layer declared in `index.html` is skipped, and the Actors it
   * would have drawn keep their own sprites — so the arrival degrades to the
   * Cast walking it rather than to people vanishing, which is the state this
   * Room ships in until ticket 33 delivers §6.4's sheets.
   */
  function playBeats(arrival: ArrivalView): ReadonlySet<ActorId> {
    const acted = new Set<ActorId>();
    const showing = new Set<string>();
    for (const beat of arrival.beats) {
      const layer = beatLayers.get(beat.id);
      if (!layer) continue;
      showing.add(beat.id);
      layer.hidden = false;
      place(layer, beat.box);
      const columns = Math.min(beat.frames, beat.columns);
      const rows = Math.ceil(beat.frames / columns);
      const column = beat.frame % columns;
      const row = Math.floor(beat.frame / columns);
      layer.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
      layer.style.backgroundPosition = `${columns > 1 ? (column * 100) / (columns - 1) : 0}% ${
        rows > 1 ? (row * 100) / (rows - 1) : 0
      }%`;
      for (const actor of beat.hides) acted.add(actor);
    }
    for (const [id, layer] of beatLayers) if (!showing.has(id)) layer.hidden = true;
    return acted;
  }

  let painted: { arrival: World['arrival']; vase: VaseState } | null = null;
  return (next: World) => {
    world = next;
    openTheDoor();
    const arrival = arrivalView(next);
    // Sounds are edge-triggered: they name what the last tick crossed, so they
    // are played before anything below can decide the paint is unchanged.
    for (const name of arrival.sfx) playSfx(name);
    if (arrival.state === 'done') rememberArrival();

    const vase = vaseState(next);
    if (painted && painted.arrival === next.arrival && painted.vase === vase) return;
    painted = { arrival: next.arrival, vase };

    showProps(entrywayProps(next));
    // Each of the vase's two Props has one sentence of its own and says it in
    // whichever state it is shown in, so the sentences are the markup's
    // `data-i18n-aria` and `src/dom/language.ts` sweeps them like any other —
    // the same arrangement the other four Breakables ship with. All that is
    // left here is which of the two is on the table.
    props.get('vaseIntact')!.hidden = vase !== 'intact';
    props.get('vaseBroken')!.hidden = vase !== 'broken';

    const acted = playBeats(arrival);
    for (const [id, element] of cast) {
      element.classList.toggle('is-acted', acted.has(id));
      const costume = arrival.costumes[id];
      if (costume) element.dataset.costume = costume;
      else delete element.dataset.costume;
    }
  };
};
