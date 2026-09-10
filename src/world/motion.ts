/**
 * Whether the apartment is allowed to move.
 *
 * Two facts, because the visitor's own choice has to be able to overrule their
 * system's: the state in force, and whether the visitor put it there. Nothing
 * here is ever stored — motion is decided afresh on each visit, from the
 * system preference the DOM layer reports.
 */
export interface MotionSlice {
  /** Motion is off: Scenes hold their frame and Rooms change without animating. */
  readonly paused: boolean;
  /** The visitor has used the motion control, so the system no longer reseeds this. */
  readonly chosenByVisitor: boolean;
}

/** Seed motion from the visitor's system preference. */
export function createMotion(reducedMotion: boolean): MotionSlice {
  return { paused: reducedMotion, chosenByVisitor: false };
}

/**
 * Motion after the visitor uses the motion control.
 *
 * This is the deliberate choice that keeps playback available to someone who
 * asked their system for reduced motion, so it also ends the reseeding.
 */
export function toggleMotion(motion: MotionSlice): MotionSlice {
  return { paused: !motion.paused, chosenByVisitor: true };
}

/** Motion after the system's reduced-motion request changes under us. */
export function withReducedMotion(motion: MotionSlice, reducedMotion: boolean): MotionSlice {
  return motion.chosenByVisitor ? motion : { paused: reducedMotion, chosenByVisitor: false };
}
