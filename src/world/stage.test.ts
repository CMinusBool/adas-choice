import { describe, expect, it } from 'vitest';

import { ROOM_IDS, STAGES } from './index';

describe('every Room has a stage of its own', () => {
  it('gives every Room a stage, and no stage to anything that is not a Room', () => {
    expect(Object.keys(STAGES).sort()).toEqual([...ROOM_IDS].sort());
  });

  it('stands the Cinema on the 1360 x 765 stage its outpainted backdrop gives it (92)', () => {
    expect(STAGES.cinema).toEqual({ width: 1360, height: 765 });
  });

  it('keeps every stage exactly 16:9 in whole units', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      expect(Number.isInteger(width) && Number.isInteger(height), `the ${room} stage is ${width} x ${height}`).toBe(true);
      expect(width * 9, `the ${room} stage is ${width} x ${height}`).toBe(height * 16);
    }
  });

  it('puts the Game Room on the stage its backdrop takes at true size', () => {
    // 89, design 75 §2.1: S01 scaled × 0.88 whole, so its painted doorway is the
    // one door, 350 units tall.
    expect(STAGES.games).toEqual({ width: 1408, height: 792 });
  });
});
