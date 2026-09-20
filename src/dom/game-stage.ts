import { isRoomPainted, type World } from '../world';
import { WIDE_LAYOUT, byId, type Painter } from './painter';

/**
 * The Game Room's wall unit: where the deck of cards hangs, and how much room
 * the Room has to leave above the stage for it.
 *
 * A card is taller than a 16:9 stage — at the reference width the copy alone is
 * most of it — so the stage stays exactly 16:9, because `src/dom/actors.ts`
 * positions the Cast as percentages of it, and the deck hangs above its top
 * edge with the Room section carrying the wall behind the overhang (design note
 * 11 §3.4). Nothing below stage y 380 moves, and no other Room is affected.
 *
 * Two numbers cannot be had in CSS, so they are measured here and handed to the
 * stylesheet as custom properties, which then does all the geometry: the
 * stage's rendered width, and the deck's own height. Everything else — the
 * casework, the bays, the bulbs, the Props — is written in stage units off
 * those two.
 *
 * This painter decides nothing about the cards. Which one is selected is
 * `src/dom/game-room.ts`'s answer and stays there; this only reads the class it
 * writes, so that in the narrow layout the matching empty bay can light up.
 */

export const mountGameStage = (): Painter => {
  const scene = byId('games-scene');
  const stage = scene.querySelector<HTMLElement>('[data-stage="games"]')!;
  const slot = scene.querySelector<HTMLElement>('[data-deck-slot]')!;
  const flow = document.querySelector<HTMLElement>('[data-deck-flow]')!;
  const deck = byId('games');
  const wraps = [...document.querySelectorAll<HTMLElement>('.game-wrap')];
  const wideLayout = matchMedia(WIDE_LAYOUT);

  const px = (value: number) => `${value.toFixed(2)}px`;

  /**
   * Hand the stylesheet the stage's width and the deck's height.
   *
   * The deck's height counts only while it is in the wall unit: in the narrow
   * layout it has left the stage for the flow below, so there is no overhang
   * and the Room closes back up to its cornice.
   */
  function measure() {
    const width = stage.getBoundingClientRect().width;
    if (width > 0) scene.style.setProperty('--stage-width', px(width));
    scene.style.setProperty(
      '--deck-height',
      wideLayout.matches ? px(deck.getBoundingClientRect().height) : '0px',
    );
  }

  /**
   * Put the deck where this width keeps it.
   *
   * Wide: inside the wall unit, and it *is* the three bays. Narrow: below the
   * stage as a single column, exactly as the page has always shown it, with the
   * bays left behind empty and lit — the games are off the shelf and in your
   * hands. The cards move as one element, so every listener, every sprite and
   * the selection all travel with them.
   */
  function house() {
    const home = wideLayout.matches ? slot : flow;
    if (deck.parentElement !== home) home.append(deck);
    measure();
  }

  /** The bay to light while the deck is in the flow: the card being read. */
  function litBay() {
    const lit = wraps.find(wrap => wrap.classList.contains('is-scroll-active'));
    if (lit?.dataset.game) stage.dataset.litBay = lit.dataset.game;
    else delete stage.dataset.litBay;
  }

  wideLayout.addEventListener('change', house);

  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(measure);
    sizes.observe(stage);
    sizes.observe(deck);
  } else {
    addEventListener('resize', measure, { passive: true });
  }

  const selection = new MutationObserver(litBay);
  for (const wrap of wraps) selection.observe(wrap, { attributes: true, attributeFilter: ['class'] });

  house();
  litBay();

  // A hidden Room measures zero, so the first real measurement is the one taken
  // once the Room is standing. `ResizeObserver` reports that too; this only
  // makes sure the very first paint of the Room is not a frame behind.
  let painted = false;
  return (world: World) => {
    const standing = isRoomPainted(world, 'games');
    if (standing === painted) return;
    painted = standing;
    if (standing) measure();
  };
};
