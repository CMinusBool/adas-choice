import { actorView, type ActorId, type World } from '../world';
import type { Painter } from './painter';

/**
 * Paint who is sitting down.
 *
 * 34: a Room can draw an Actor seated — the Game Room's S09 and S10, the two of
 * them on their poufs with a controller each — and a seated still is not a
 * Cycle: it replaces the standing sprite rather than playing on it. Whether an
 * Actor is seated is the model's answer (`ActorView.seated`: on a seated mark,
 * walk over). This writes it onto each stage that has a `[data-seat]` still as
 * `data-seated`, a space-separated list of who is seated there, and the stage's
 * CSS shows the still and hides the sprite and the empty seat under it.
 *
 * Its own painter because it is its own question about the actors slice, asked
 * of stages the actors painter does not otherwise read; mounted after it, so a
 * sprite has been put on its stage before it is hidden there.
 */
export const mountSeats = (): Painter => {
  const stages = [...document.querySelectorAll<HTMLElement>('.stage')]
    .map(stage => ({
      stage,
      seats: [...stage.querySelectorAll<HTMLElement>('[data-seat]')].map(seat => seat.dataset.seat as ActorId),
    }))
    .filter(({ seats }) => seats.length > 0);

  return (world: World) => {
    for (const { stage, seats } of stages) {
      const room = stage.dataset.stage;
      const seated = seats.filter(id => {
        const view = actorView(world, id);
        return view !== null && view.room === room && view.seated;
      });
      const value = seated.join(' ');
      if ((stage.dataset.seated ?? '') !== value) stage.dataset.seated = value;
    }
  };
};
