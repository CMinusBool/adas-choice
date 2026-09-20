import {
  CAT_IDS,
  actorView,
  catSfx,
  isBeingPetted,
  pettingBeat,
  type ActorView,
  type CatId,
  type CatsSlice,
  type World,
} from '../world';
import { byId, type Dispatch, type Painter } from './painter';
import { playSfx } from './sound';

/**
 * Paint the cats slice: the fuss, its Beat, and the noises the three of them
 * make.
 *
 * Where they walk is not this file's business — a cat crossing a floor is an
 * Actor crossing a floor, and `src/dom/actors.ts` paints it like any other.
 * What is here is everything `world.cats` decides and nothing else: the one
 * part of the Cast the visitor can reach, the Beat that stands in for her
 * while a hand is on her, and the meows and breaking china the slice names.
 *
 * Each cat is a real `<button>` in `index.html`, so Enter, Space and a tap all
 * arrive here as one click and the focus ring is the browser's; the order Tab
 * visits them in is the order the Actors painter appends them to a stage in.
 * The model decides what a fuss means; this file only reports that one
 * happened.
 */

/** One cat on the page: the button the visitor reaches for, and her Beat. */
interface Fussable {
  readonly id: CatId;
  readonly element: HTMLElement;
  /** How tall she stands, in stage units — the reading the Cast is placed at. */
  readonly height: number;
  /** Her petting Beat's layer, or `null` where no sheet for it has been drawn. */
  readonly beat: HTMLElement | null;
}

const number = (element: HTMLElement, name: string, fallback: number) => {
  const value = Number(element.dataset[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const mountCats = (dispatch: Dispatch): Painter => {
  const apartment = byId('apartment');
  const beats = new Map<string, HTMLElement>(
    [...apartment.querySelectorAll<HTMLElement>('[data-beat]')].map(layer => [layer.dataset.beat!, layer]),
  );

  const cats: Fussable[] = CAT_IDS.flatMap(id => {
    const element = apartment.querySelector<HTMLElement>(`[data-actor="${id}"]`);
    if (!element) return [];
    element.addEventListener('click', () => {
      dispatch({ type: 'cat-petted', cat: id, now: performance.now() });
    });
    return [{ id, element, height: number(element, 'height', 300), beat: beats.get(pettingBeat(id)) ?? null }];
  });

  /**
   * Play the petting Beat over a cat, if a sheet for it has been delivered.
   *
   * Named by the model and skipped when `index.html` declares no layer for it,
   * which is ticket 14's arrangement for the arrival: the fuss then degrades to
   * the cat stopping where she is rather than to a cat that vanishes. Nothing
   * here invents a `data-sheet` for a file that is not on disk.
   *
   * The one thing it asks of the Actors painter is the shape of the frame she
   * is being drawn from, which that painter publishes on her own element as
   * `--actor-aspect`: the Beat stands in for the sprite, so it has to be the
   * sprite's box, and the sheet's frame shape is not the model's business and
   * not worth measuring a second time. This painter is mounted after that one
   * for exactly this reason. A cat with no sheet loaded yet has no property to
   * read and falls back to square, which is the same answer that painter's own
   * `aspect` starts at.
   */
  function playPetting(cat: Fussable, view: ActorView): boolean {
    const layer = cat.beat;
    if (!layer) return false;
    const aspect = Number(cat.element.style.getPropertyValue('--actor-aspect'));
    const width = cat.height * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
    const style = layer.style;
    style.setProperty('--x', String(view.at.x - width / 2));
    style.setProperty('--y', String(view.at.y - cat.height));
    style.setProperty('--w', String(width));
    style.setProperty('--h', String(cat.height));
    style.setProperty('--z', String(Math.round(view.at.y)));
    if (layer.parentElement !== cat.element.parentElement) cat.element.parentElement?.append(layer);
    layer.hidden = false;
    return true;
  }

  // The slice changes identity on the tick that names a sound and again on the
  // one that forgets it, so watching it plays each one exactly once — and a
  // repaint from somewhere else replays nothing.
  let heard: CatsSlice | null = null;

  return (world: World) => {
    if (world.cats !== heard) {
      heard = world.cats;
      for (const name of catSfx(world)) playSfx(name);
    }
    for (const cat of cats) {
      const view = actorView(world, cat.id);
      const petted = view !== null && isBeingPetted(world, cat.id);
      cat.element.classList.toggle('is-petted', petted);
      // `is-fussed` rather than the arrival's `is-acted`, because the Entryway
      // painter owns that one and the two must never argue over a cat.
      const acted = petted && view !== null && playPetting(cat, view);
      cat.element.classList.toggle('is-fussed', acted);
      if (!acted && cat.beat) cat.beat.hidden = true;
    }
  };
};
