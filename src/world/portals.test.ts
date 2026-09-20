import { describe, expect, it } from 'vitest';

import {
  PORTAL_IDS,
  advance,
  attendedPortal,
  createWorld,
  currentPortal,
  type World,
  type WorldInputs,
} from './index';

/** A visitor who opened the page straight into the Game Room. */
const arrival: WorldInputs = { hash: '#/games', storedLanguage: null, reducedMotion: false };
const inTheGameRoom = (): World => createWorld(arrival);

/**
 * The Game Room's three Portals (`docs/adr/0004`, design note 11 §5.4).
 *
 * A Portal is an aperture into one game's world. At rest it holds still; the
 * one the visitor comes near wakes and plays. "Comes near" is hover and focus
 * alike, because they are the same thing happening — the Cinema Room's Posters
 * report themselves the same way.
 */
describe('the Game Room’s three Portals', () => {
  it('names the three games, left to right across the wall', () => {
    expect([...PORTAL_IDS]).toEqual(['tango', 'lovers', 'heavenly']);
  });

  it('is found with the whole wall at rest', () => {
    expect(attendedPortal(inTheGameRoom())).toBeNull();
  });

  it('wakes the Portal the visitor is at, and only ever one', () => {
    const atLovers = advance(inTheGameRoom(), { type: 'portal-attended', portal: 'lovers' });
    expect(attendedPortal(atLovers)).toBe('lovers');

    const atHeavenly = advance(atLovers, { type: 'portal-attended', portal: 'heavenly' });
    expect(attendedPortal(atHeavenly)).toBe('heavenly');
  });

  it('puts the wall back to rest when the visitor looks away', () => {
    const atTango = advance(inTheGameRoom(), { type: 'portal-attended', portal: 'tango' });
    expect(attendedPortal(advance(atTango, { type: 'portal-attended', portal: null }))).toBeNull();
  });

  it('hands back the same world when the report says nothing new', () => {
    const atTango = advance(inTheGameRoom(), { type: 'portal-attended', portal: 'tango' });
    expect(advance(atTango, { type: 'portal-attended', portal: 'tango' })).toBe(atTango);
  });

  it('wakes nothing for a visitor who is somewhere else in the apartment', () => {
    const cinema = createWorld({ ...arrival, hash: '#/cinema' });
    expect(advance(cinema, { type: 'portal-attended', portal: 'tango' })).toBe(cinema);
  });

  it('lets no Portal stay awake once the visitor walks out of the Room', () => {
    const atTango = advance(inTheGameRoom(), { type: 'portal-attended', portal: 'tango' });
    const gone = advance(atTango, { type: 'hash-changed', hash: '#/cinema' });
    expect(attendedPortal(gone)).toBeNull();
  });
});

/**
 * Below 1080 px the wall only has room for one Portal (design note 11 §3.5),
 * so which of the three is on it is a decision, and the three dots, the arrow
 * keys and a tap on a dot are three ways of reporting the same one.
 */
describe('the Portal a narrow wall has room for', () => {
  it('starts on the first of the three', () => {
    expect(currentPortal(inTheGameRoom())).toBe('tango');
  });

  it('moves to whichever Portal a dot names', () => {
    const chosen = advance(inTheGameRoom(), { type: 'portal-chosen', portal: 'heavenly' });
    expect(currentPortal(chosen)).toBe('heavenly');
    expect(advance(chosen, { type: 'portal-chosen', portal: 'heavenly' })).toBe(chosen);
  });

  it('steps forward and back through the three', () => {
    const second = advance(inTheGameRoom(), { type: 'portal-stepped', step: 1 });
    expect(currentPortal(second)).toBe('lovers');
    expect(currentPortal(advance(second, { type: 'portal-stepped', step: 1 }))).toBe('heavenly');
    expect(currentPortal(advance(second, { type: 'portal-stepped', step: -1 }))).toBe('tango');
  });

  it('wraps at both ends, so the three are a ring rather than a queue', () => {
    const first = inTheGameRoom();
    expect(currentPortal(advance(first, { type: 'portal-stepped', step: -1 }))).toBe('heavenly');

    const last = advance(first, { type: 'portal-chosen', portal: 'heavenly' });
    expect(currentPortal(advance(last, { type: 'portal-stepped', step: 1 }))).toBe('tango');
  });

  it('leaves the new Portal at rest, because nothing is near it yet', () => {
    const awake = advance(inTheGameRoom(), { type: 'portal-attended', portal: 'tango' });
    const moved = advance(awake, { type: 'portal-stepped', step: 1 });
    expect(currentPortal(moved)).toBe('lovers');
    expect(attendedPortal(moved)).toBeNull();
  });

  it('changes nothing for a visitor who is somewhere else in the apartment', () => {
    const cinema = createWorld({ ...arrival, hash: '#/cinema' });
    expect(advance(cinema, { type: 'portal-chosen', portal: 'lovers' })).toBe(cinema);
    expect(advance(cinema, { type: 'portal-stepped', step: 1 })).toBe(cinema);
  });
});
