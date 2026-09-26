import { describe, expect, it } from 'vitest';

import { ROOM_IDS, STAGES } from './index';

describe('every Room has a stage of its own', () => {
  it('gives every Room a stage, and no stage to anything that is not a Room', () => {
    expect(Object.keys(STAGES).sort()).toEqual([...ROOM_IDS].sort());
  });

  it('keeps every stage exactly 16:9 in whole units', () => {
    for (const room of ROOM_IDS) {
      const { width, height } = STAGES[room];
      expect(Number.isInteger(width) && Number.isInteger(height), `the ${room} stage is ${width} x ${height}`).toBe(true);
      expect(width * 9, `the ${room} stage is ${width} x ${height}`).toBe(height * 16);
    }
  });
});
