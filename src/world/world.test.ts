import { describe, expect, it } from 'vitest';

import {
  actorsIn,
  advance,
  apartmentNeedsClock,
  breakableState,
  createWorld,
  isCurrentRoom,
  isRoomPainted,
  motionIsOn,
  motionIsOnByChoice,
  roomHash,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

describe('arriving in the apartment', () => {
  it('puts a visitor with no hash in the Entryway', () => {
    const world = createWorld(plainArrival);
    expect(world.rooms.current).toBe('entryway');
  });

  it('puts a visitor who linked straight to a Room in that Room', () => {
    expect(createWorld({ ...plainArrival, hash: '#/cinema' }).rooms.current).toBe('cinema');
  });

  it('puts a visitor with an unreadable hash in the Entryway', () => {
    expect(createWorld({ ...plainArrival, hash: '#/kitchen' }).rooms.current).toBe('entryway');
  });

  it('arrives settled, with no Room being left behind', () => {
    const world = createWorld(plainArrival);
    expect(world.rooms.leaving).toBe(null);
    expect(world.rooms.transition).toBe('settled');
  });
});

describe('moving between Rooms', () => {
  it('enters the Room the new hash names', () => {
    const world = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/cinema' });
    expect(world.rooms.current).toBe('cinema');
  });

  it('keeps the Room being left until the transition ends', () => {
    const world = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/games' });
    expect(world.rooms.leaving).toBe('entryway');
    expect(isRoomPainted(world, 'entryway')).toBe(true);
    expect(isRoomPainted(world, 'games')).toBe(true);
    expect(isCurrentRoom(world, 'games')).toBe(true);
    expect(isCurrentRoom(world, 'entryway')).toBe(false);
  });

  it('drops the Room left behind once the transition has ended', () => {
    const moving = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/games' });
    const settled = advance(moving, { type: 'room-transition-finished' });
    expect(settled.rooms).toEqual({ current: 'games', leaving: null, transition: 'settled' });
    expect(isRoomPainted(settled, 'entryway')).toBe(false);
    expect(isRoomPainted(settled, 'games')).toBe(true);
  });

  it('leaves the world alone when the hash names the Room already entered', () => {
    const world = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/games' });
    expect(advance(world, { type: 'hash-changed', hash: '#/games' })).toBe(world);
  });

  it('reads an unknown hash as a move back to the Entryway', () => {
    const inGames = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/games' });
    const settled = advance(inGames, { type: 'room-transition-finished' });
    expect(advance(settled, { type: 'hash-changed', hash: '#/kitchen' }).rooms.current).toBe('entryway');
  });
});

describe('whether a Room transition animates', () => {
  const enterGames = (world: ReturnType<typeof createWorld>) =>
    advance(world, { type: 'hash-changed', hash: '#/games' });

  it('animates while motion is on', () => {
    expect(enterGames(createWorld(plainArrival)).rooms.transition).toBe('animated');
  });

  it('is instant for a visitor who asked their system for reduced motion', () => {
    const world = createWorld({ ...plainArrival, reducedMotion: true });
    expect(motionIsOn(world)).toBe(false);
    expect(enterGames(world).rooms.transition).toBe('instant');
  });

  it('is instant once the visitor has used the motion control to pause', () => {
    const paused = advance(createWorld(plainArrival), { type: 'motion-toggled' });
    expect(motionIsOn(paused)).toBe(false);
    expect(enterGames(paused).rooms.transition).toBe('instant');
  });

  it('animates again for a reduced-motion visitor who turns motion on deliberately', () => {
    const asked = createWorld({ ...plainArrival, reducedMotion: true });
    const playing = advance(asked, { type: 'motion-toggled' });
    expect(motionIsOn(playing)).toBe(true);
    expect(enterGames(playing).rooms.transition).toBe('animated');
  });

  it('follows a system reduced-motion request the visitor has not overruled', () => {
    const world = advance(createWorld(plainArrival), { type: 'reduced-motion-changed', reducedMotion: true });
    expect(motionIsOn(world)).toBe(false);
    expect(enterGames(world).rooms.transition).toBe('instant');
  });

  it('ignores a system reduced-motion request once the visitor has chosen for themselves', () => {
    const chosen = advance(advance(createWorld(plainArrival), { type: 'motion-toggled' }), { type: 'motion-toggled' });
    const world = advance(chosen, { type: 'reduced-motion-changed', reducedMotion: true });
    expect(motionIsOn(world)).toBe(true);
    expect(enterGames(world).rooms.transition).toBe('animated');
  });

  it('leaves a transition already in flight alone when motion is turned off mid-move', () => {
    const moving = advance(createWorld(plainArrival), { type: 'hash-changed', hash: '#/cinema' });
    const paused = advance(moving, { type: 'motion-toggled' });
    expect(paused.rooms.transition).toBe('animated');
  });

  it('takes a fresh visit from the system alone, because the choice is never stored', () => {
    // The only motion input `createWorld` has is the system preference: a
    // previous visit's toggle cannot reach it.
    expect(motionIsOn(createWorld({ ...plainArrival, reducedMotion: true }))).toBe(false);
    expect(motionIsOn(createWorld({ ...plainArrival, reducedMotion: false }))).toBe(true);
  });
});

describe('whether the visitor has overruled their system on motion', () => {
  const toggle = (world: ReturnType<typeof createWorld>) => advance(world, { type: 'motion-toggled' });

  it('has not happened on arrival, whichever way the system leans', () => {
    expect(motionIsOnByChoice(createWorld(plainArrival))).toBe(false);
    expect(motionIsOnByChoice(createWorld({ ...plainArrival, reducedMotion: true }))).toBe(false);
  });

  it('happens when someone who asked for reduced motion turns motion on', () => {
    const playing = toggle(createWorld({ ...plainArrival, reducedMotion: true }));
    expect(motionIsOn(playing)).toBe(true);
    expect(motionIsOnByChoice(playing)).toBe(true);
  });

  it('is undone by pausing again, and is never true while motion is off', () => {
    const pausedAgain = toggle(toggle(createWorld({ ...plainArrival, reducedMotion: true })));
    expect(motionIsOn(pausedAgain)).toBe(false);
    expect(motionIsOnByChoice(pausedAgain)).toBe(false);
    expect(motionIsOnByChoice(toggle(createWorld(plainArrival)))).toBe(false);
  });

  it('outlasts a reduced-motion request the system makes afterwards', () => {
    const chosen = toggle(toggle(createWorld(plainArrival)));
    const asked = advance(chosen, { type: 'reduced-motion-changed', reducedMotion: true });
    expect(motionIsOn(asked)).toBe(true);
    expect(motionIsOnByChoice(asked)).toBe(true);
  });
});

describe('a Breakable, once it has gone over', () => {
  /**
   * `breakable-broken` is the general way to knock one down without waiting on
   * a cat's own roll — 09's public seam for exactly this, so a test can put
   * the apartment in the state a visit eventually reaches without simulating
   * the minutes it takes to get there.
   */
  const knockVase = (world: ReturnType<typeof createWorld>) =>
    advance(world, { type: 'breakable-broken', breakable: 'entryway-vase' });

  it('starts every visit whole', () => {
    expect(breakableState(createWorld(plainArrival), 'entryway-vase')).toBe('intact');
  });

  it('is recorded once, and again does nothing', () => {
    const broken = knockVase(createWorld(plainArrival));
    expect(breakableState(broken, 'entryway-vase')).toBe('broken');
    expect(knockVase(broken)).toBe(broken);
  });

  it('survives a Room change', () => {
    const broken = knockVase(createWorld(plainArrival));
    const movedOn = advance(broken, { type: 'hash-changed', hash: roomHash('games') });
    expect(breakableState(movedOn, 'entryway-vase')).toBe('broken');
  });

  it('survives a reload — the DOM layer hands back what it read from session storage', () => {
    const reloaded = createWorld({ ...plainArrival, brokenBreakables: ['entryway-vase'] });
    expect(breakableState(reloaded, 'entryway-vase')).toBe('broken');
  });

  it('does not survive a new tab — nothing stored, nothing broken', () => {
    // A new tab is a fresh `createWorld` with no `brokenBreakables` input at
    // all, exactly like the very first visit above: session storage is
    // per-tab, so this is the same call and the same answer.
    expect(breakableState(createWorld(plainArrival), 'entryway-vase')).toBe('intact');
  });
});

/**
 * 40: the page's frame loop asks the model one question.
 *
 * It used to read three slices for itself — the Cast, the arrival and the
 * Cinema Room — from inside the Actors painter, which is one painter deciding
 * the clock for three slices. What is left to the page is what the browser
 * alone can know: a hidden tab, a stage scrolled off the screen.
 */
describe('whether the page needs to keep a frame clock running', () => {
  it('runs while the Room the visitor is in has Actors in it and may move', () => {
    const home = createWorld({ ...plainArrival, arrived: true });
    expect(actorsIn(home, 'entryway').length).toBeGreaterThan(0);
    expect(apartmentNeedsClock(home)).toBe(true);
  });

  it('stops once the apartment has been asked to hold still', () => {
    const still = createWorld({ ...plainArrival, arrived: true, reducedMotion: true });
    expect(apartmentNeedsClock(still)).toBe(false);
  });

  it('runs through the arrival even though the hall it opens on is empty', () => {
    const arriving = advance(createWorld(plainArrival), { type: 'arrival-started' });
    expect(actorsIn(arriving, 'entryway')).toEqual([]);
    expect(apartmentNeedsClock(arriving)).toBe(true);
  });
});

describe('the language in force', () => {
  it('opens the apartment in Traditional Chinese', () => {
    expect(createWorld(plainArrival).language).toBe('zh-Hant');
  });

  it('opens in the language a previous visit stored', () => {
    expect(createWorld({ ...plainArrival, storedLanguage: 'en' }).language).toBe('en');
  });

  it('switches the whole apartment when the language control is used', () => {
    const english = advance(createWorld(plainArrival), { type: 'language-toggled' });
    expect(english.language).toBe('en');
    expect(advance(english, { type: 'language-toggled' }).language).toBe('zh-Hant');
  });

  it('does not move the visitor between Rooms when the language changes', () => {
    const inCinema = advance(createWorld({ ...plainArrival, hash: '#/cinema' }), { type: 'language-toggled' });
    expect(inCinema.rooms).toEqual({ current: 'cinema', leaving: null, transition: 'settled' });
  });
});
