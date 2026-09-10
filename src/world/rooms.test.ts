import { describe, expect, it } from 'vitest';

import { ROOM_IDS, isCanonicalHash, parseRoute, roomHash } from './index';

describe('route parsing', () => {
  it('reads each of the four Rooms off its own route', () => {
    expect(parseRoute('#/entryway')).toBe('entryway');
    expect(parseRoute('#/games')).toBe('games');
    expect(parseRoute('#/cinema')).toBe('cinema');
    expect(parseRoute('#/activities')).toBe('activities');
  });

  it('has a route for every Room and no Room without one', () => {
    expect([...ROOM_IDS]).toEqual(['entryway', 'games', 'cinema', 'activities']);
  });

  it('sends an empty hash to the Entryway', () => {
    expect(parseRoute('')).toBe('entryway');
    expect(parseRoute('#')).toBe('entryway');
    expect(parseRoute('#/')).toBe('entryway');
  });

  it('sends a hash it cannot read to the Entryway', () => {
    expect(parseRoute('#/kitchen')).toBe('entryway');
    expect(parseRoute('#/games/tango')).toBe('entryway');
    expect(parseRoute('#!/cinema')).toBe('entryway');
    expect(parseRoute('#/cinema?reel=1')).toBe('entryway');
  });

  it('reads a Room the visitor half-typed, so a near miss still lands somewhere', () => {
    expect(parseRoute('#games')).toBe('games');
    expect(parseRoute('#/Cinema')).toBe('cinema');
    expect(parseRoute('#/GAMES/')).toBe('games');
  });
});

describe('canonical hashes', () => {
  it('names each Room with the hash its door carries', () => {
    expect(roomHash('entryway')).toBe('#/entryway');
    expect(roomHash('cinema')).toBe('#/cinema');
  });

  it('round-trips every Room through its hash', () => {
    for (const room of ROOM_IDS) expect(parseRoute(roomHash(room))).toBe(room);
  });

  it('recognises a hash that is already canonical', () => {
    for (const room of ROOM_IDS) expect(isCanonicalHash(roomHash(room))).toBe(true);
  });

  it('asks for a rewrite of anything else, so junk never sticks in history', () => {
    expect(isCanonicalHash('')).toBe(false);
    expect(isCanonicalHash('#/kitchen')).toBe(false);
    expect(isCanonicalHash('#/Cinema')).toBe(false);
    expect(isCanonicalHash('#/games/')).toBe(false);
  });
});
