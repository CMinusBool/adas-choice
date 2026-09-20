import { copy, type CopyKey } from '../copy';
import { chosenActivity, openActivity, type ActivityId, type Language, type World } from '../world';
import { WIDE_LAYOUT, byId, type Dispatch, type Painter } from './painter';
import { playSfx } from './sound';

/**
 * The Activity Room: three stations, one card, and tonight's pick.
 *
 * Which card is open and which activity was chosen are the world model's
 * answers (`src/world/activities.ts`); this file reports a click and paints
 * whatever comes back. The Room's Props are declared in `index.html` in stage
 * units, so nothing here knows a pixel — it toggles attributes and fills text.
 *
 * Nobody walks in this Room. Choosing an activity swaps the two of them for a
 * painted still at that station's mark, which is the parked-animation answer
 * from `design/12-activity-room.md` §9.2 rather than a walk this Room lacks
 * the Cycles to draw.
 */

/** Every string one station's card is made of, as `src/copy.ts` keys. */
interface CardCopy {
  readonly name: CopyKey;
  readonly aria: CopyKey;
  readonly line: CopyKey;
  readonly time: CopyKey;
  readonly needs: CopyKey;
  readonly steps: readonly [CopyKey, CopyKey, CopyKey];
  /** A muted fourth line, which only the Blind Portrait has. */
  readonly extra?: CopyKey;
  readonly why: CopyKey;
}

const CARDS: Record<ActivityId, CardCopy> = {
  draw: {
    name: 'activityDrawName',
    aria: 'activityDrawAria',
    line: 'activityDrawLine',
    time: 'activityDrawTime',
    needs: 'activityDrawNeeds',
    steps: ['activityDrawStep1', 'activityDrawStep2', 'activityDrawStep3'],
    extra: 'activityDrawExtra',
    why: 'activityDrawWhy',
  },
  hunt: {
    name: 'activityHuntName',
    aria: 'activityHuntAria',
    line: 'activityHuntLine',
    time: 'activityHuntTime',
    needs: 'activityHuntNeeds',
    steps: ['activityHuntStep1', 'activityHuntStep2', 'activityHuntStep3'],
    why: 'activityHuntWhy',
  },
  map: {
    name: 'activityMapName',
    aria: 'activityMapAria',
    line: 'activityMapLine',
    time: 'activityMapTime',
    needs: 'activityMapNeeds',
    steps: ['activityMapStep1', 'activityMapStep2', 'activityMapStep3'],
    why: 'activityMapWhy',
  },
};

export const mountActivityRoom = (dispatch: Dispatch): Painter => {
  const stage = document.querySelector<HTMLElement>('[data-stage="activities"]')!;
  const stations = [...stage.querySelectorAll<HTMLButtonElement>('.a-station')];
  const chalkboards = [...stage.querySelectorAll<HTMLElement>('[data-chalkboard]')];
  const tableaux = [...stage.querySelectorAll<HTMLElement>('[data-tableau]')];
  const scrim = byId('activity-scrim');
  const card = byId('activity-card');
  const title = byId('activity-card-title');
  const steps = [...byId<HTMLOListElement>('activity-card-steps').querySelectorAll('li')];
  const extra = byId('activity-card-extra');
  const note = byId('activity-chosen-note');
  const unpick = byId<HTMLButtonElement>('activity-unpick');
  // The scrim only covers the stage on a wide shell; under 1080 px the card is
  // an ordinary block below it and the Room stays live behind nothing at all.
  const wideLayout = matchMedia(WIDE_LAYOUT);

  /** The station the open card belongs to, so focus can go back where it came from. */
  let opener: HTMLButtonElement | null = null;
  /** What the world says is open, read by the listeners below between paints. */
  let open: ActivityId | null = null;

  for (const station of stations) {
    station.addEventListener('click', () => {
      opener = station;
      playSfx('activity-card');
      dispatch({ type: 'activity-card-opened', activity: station.dataset.activity as ActivityId });
    });
  }

  const close = () => dispatch({ type: 'activity-card-closed' });
  byId('activity-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  byId('activity-pick').addEventListener('click', () => {
    if (!open) return;
    playSfx('timer-ding');
    dispatch({ type: 'activity-chosen', activity: open });
  });
  // 50: and back out again. Choosing swaps the Boy and the Girl for a tableau,
  // and until this existed nothing anywhere cleared `chosen`, so the two of
  // them left the Room for the rest of the visit on the first pick.
  unpick.addEventListener('click', () => dispatch({ type: 'activity-unchosen' }));
  // Escape closes the card wherever focus is, which is what a dialog owes the
  // keyboard even when it is not modal.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    close();
  });

  let painted: { open: ActivityId | null; chosen: ActivityId | null; language: Language } | null = null;

  return (world: World) => {
    const next = { open: openActivity(world), chosen: chosenActivity(world), language: world.language };
    open = next.open;
    if (painted && painted.open === next.open && painted.chosen === next.chosen && painted.language === next.language) return;
    const opening = next.open !== null && painted?.open !== next.open;
    const closing = next.open === null && painted !== null && painted.open !== null;
    // 50: the pick going back takes its own button off the page with it, so
    // something has to catch the focus that was standing on it.
    const unpicked = next.chosen === null && painted !== null && painted.chosen !== null ? painted.chosen : null;
    painted = next;
    const words = copy[world.language];

    for (const station of stations) {
      const id = station.dataset.activity as ActivityId;
      const chosen = next.chosen === id;
      station.setAttribute('aria-expanded', String(next.open === id));
      // The chosen station says so in its own name, which the `data-i18n-aria`
      // sweep cannot do for it — hence no `data-i18n-aria` on these buttons.
      station.setAttribute('aria-label', chosen ? `${words[CARDS[id].aria]} ${words.activityChosenSuffix}` : words[CARDS[id].aria]);
      station.toggleAttribute('data-chosen', chosen);
    }
    for (const board of chalkboards) board.toggleAttribute('data-chosen', board.dataset.chalkboard === next.chosen);
    for (const tableau of tableaux) tableau.hidden = tableau.dataset.tableau !== next.chosen;
    stage.classList.toggle('has-tableau', next.chosen !== null);
    note.hidden = next.chosen === null;
    unpick.hidden = next.chosen === null;

    // Inert rather than merely covered: what the scrim hides from the pointer
    // it has to hide from the keyboard too.
    stage.inert = next.open !== null && wideLayout.matches;
    scrim.hidden = next.open === null;
    card.hidden = next.open === null;
    if (next.open) {
      const keys = CARDS[next.open];
      title.textContent = words[keys.name];
      byId('activity-card-line').textContent = words[keys.line];
      byId('activity-card-time').textContent = words[keys.time];
      byId('activity-card-needs').textContent = words[keys.needs];
      steps.forEach((step, index) => (step.textContent = words[keys.steps[index]]));
      extra.hidden = keys.extra === undefined;
      extra.textContent = keys.extra ? words[keys.extra] : '';
      byId('activity-card-why').textContent = words[keys.why];
    }

    // Focus follows the card in and back out again: into its heading when it
    // opens, and to the station that opened it when it goes.
    if (opening) title.focus({ preventScroll: true });
    if (closing) {
      opener?.focus({ preventScroll: true });
      opener = null;
    }
    // Back to the station that had been picked, which is both where the
    // decision was made and the obvious place to make it again. Only when the
    // focus was really on the button that has just gone: clearing the pick
    // from anywhere else must not yank the page around.
    if (unpicked && (document.activeElement === unpick || document.activeElement === document.body)) {
      stations.find(station => station.dataset.activity === unpicked)?.focus({ preventScroll: true });
    }
  };
};
