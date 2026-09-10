import { copy } from '../copy';
import { motionIsOn, type Language, type World } from '../world';
import { byId, type Dispatch, type Painter } from './painter';

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** What the visitor's system asks for, read once at start-up. */
export function prefersReducedMotion(): boolean {
  return reducedMotion.matches;
}

/**
 * Paint the motion control and the page's motion state.
 *
 * The control's label is language-dependent and its state is not stored, so
 * this repaints whenever either changes. Whether a Room transition animates is
 * not decided here — the model decides it; `src/dom/rooms.ts` obeys.
 */
export const mountMotion = (dispatch: Dispatch): Painter => {
  const toggle = byId<HTMLButtonElement>('motion-toggle');
  toggle.addEventListener('click', () => dispatch({ type: 'motion-toggled' }));
  reducedMotion.addEventListener('change', event => dispatch({ type: 'reduced-motion-changed', reducedMotion: event.matches }));
  toggle.hidden = false;

  let painted: { paused: boolean; language: Language } | null = null;
  return (world: World) => {
    const paused = !motionIsOn(world);
    if (painted && painted.paused === paused && painted.language === world.language) return;
    painted = { paused, language: world.language };
    root.classList.toggle('motion-off', paused);
    const label = copy[world.language][paused ? 'play' : 'pause'];
    byId('motion-label').textContent = label;
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(paused));
  };
};
