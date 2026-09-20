/**
 * The Activity Room's three stations, and what the visitor has done with them.
 *
 * Three things two people can do together through a screen, from
 * `design/12-activity-room.md`: read what one involves, then pick it for
 * tonight. Both are decisions, so both live here — the Room's page only reports
 * a click and paints whatever comes back.
 */
export type ActivityId = 'draw' | 'hunt' | 'map';

/** Every activity, left to right across the Room's back wall. */
export const ACTIVITY_IDS: readonly ActivityId[] = ['draw', 'hunt', 'map'];

/** What the Activity Room is showing, and what was chosen for tonight. */
export interface ActivitiesSlice {
  /**
   * The station whose card is open, or `null`.
   *
   * One card is reused by all three stations, so this is a single answer
   * rather than three: opening a second station's card swaps the contents
   * rather than stacking a second card on top of the first.
   */
  readonly open: ActivityId | null;
  /**
   * What the visitor picked for tonight, or `null` while nothing is picked.
   *
   * Exactly one activity can be chosen, and choosing another moves the choice.
   * It lasts the visit and no longer: leaving the Room and coming back keeps
   * it, a reload does not, because only Breakables and the language preference
   * are worth remembering that long.
   */
  readonly chosen: ActivityId | null;
}

/** The Room as the visitor finds it: nothing open, nothing picked. */
export function createActivities(): ActivitiesSlice {
  return { open: null, chosen: null };
}

/** The Room after a station's card is opened, or swapped for another's. */
export function withCardOpened(activities: ActivitiesSlice, activity: ActivityId): ActivitiesSlice {
  return activities.open === activity ? activities : { ...activities, open: activity };
}

/** The Room after the card is closed — by its button, by Escape, by the scrim. */
export function withCardClosed(activities: ActivitiesSlice): ActivitiesSlice {
  return activities.open === null ? activities : { ...activities, open: null };
}

/**
 * The Room after the visitor picks an activity for tonight.
 *
 * The card's primary action, and the card leaves with it: having decided,
 * there is nothing left on it to read.
 */
export function withActivityChosen(activities: ActivitiesSlice, activity: ActivityId): ActivitiesSlice {
  if (activities.chosen === activity && activities.open === null) return activities;
  return { open: null, chosen: activity };
}

/**
 * The Room after the visitor takes tonight's pick back.
 *
 * Choosing swaps the Boy and the Girl for a painted tableau at that station,
 * and this is the way back out of it — ticket 43's "closing it brings them
 * back", which had no implementation until ticket 50 found it missing. Picking
 * a *different* activity is not that exit: it moves the tableau rather than
 * clearing it, so without this the two of them were gone for the whole visit
 * after the first pick.
 *
 * It does not open anything. The card the visitor decided from is long gone by
 * now, and un-deciding is not a reason to go back and read it again.
 */
export function withActivityCleared(activities: ActivitiesSlice): ActivitiesSlice {
  return activities.chosen === null ? activities : { ...activities, chosen: null };
}
