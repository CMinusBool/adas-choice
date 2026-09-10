import { describe, expect, it } from 'vitest';

import { advance, createWorld, isCurrentRoom, isRoomPainted, motionIsOn, type WorldInputs } from './index';

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
