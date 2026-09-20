import { describe, expect, it } from 'vitest';

import {
  advance,
  createWorld,
  isAudible,
  isMusicSourceOn,
  isRoomMusicAudible,
  ROOM_IDS,
  roomHash,
  soundIsOn,
  type RoomId,
  type World,
  type WorldInputs,
} from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

/** The world as it stands once the visitor has touched or typed something. */
const afterInteraction = () => advance(createWorld(plainArrival), { type: 'visitor-interacted' });

describe('the first interaction', () => {
  it('keeps all three tiers silent until the visitor has interacted', () => {
    const world = createWorld(plainArrival);
    expect(isAudible(world, 'sfx')).toBe(false);
    expect(isAudible(world, 'music')).toBe(false);
    expect(isAudible(world, 'film')).toBe(false);
  });

  it('makes SFX audible by default once the visitor has interacted', () => {
    expect(isAudible(afterInteraction(), 'sfx')).toBe(true);
  });
});

describe('the header sound control', () => {
  it('opens with sound on', () => {
    expect(soundIsOn(createWorld(plainArrival))).toBe(true);
  });

  it('silences SFX, and turns them back on', () => {
    const muted = advance(afterInteraction(), { type: 'sound-toggled' });
    expect(soundIsOn(muted)).toBe(false);
    expect(isAudible(muted, 'sfx')).toBe(false);

    const unmuted = advance(muted, { type: 'sound-toggled' });
    expect(soundIsOn(unmuted)).toBe(true);
    expect(isAudible(unmuted, 'sfx')).toBe(true);
  });

  it('cannot let a sound through before the visitor has interacted', () => {
    const muted = advance(createWorld(plainArrival), { type: 'sound-toggled' });
    expect(isAudible(advance(muted, { type: 'sound-toggled' }), 'sfx')).toBe(false);
  });
});

describe("a Room's Music Source", () => {
  it('leaves the Room silent until the visitor clicks it', () => {
    const world = afterInteraction();
    expect(isMusicSourceOn(world, 'entryway')).toBe(false);
    expect(isAudible(world, 'music')).toBe(false);
  });

  it('starts the Room Music when clicked', () => {
    const playing = advance(afterInteraction(), { type: 'music-source-toggled', room: 'entryway' });
    expect(isMusicSourceOn(playing, 'entryway')).toBe(true);
    expect(isAudible(playing, 'music')).toBe(true);
  });

  it('stops it again when clicked a second time', () => {
    const playing = advance(afterInteraction(), { type: 'music-source-toggled', room: 'entryway' });
    const stopped = advance(playing, { type: 'music-source-toggled', room: 'entryway' });
    expect(isMusicSourceOn(stopped, 'entryway')).toBe(false);
    expect(isAudible(stopped, 'music')).toBe(false);
  });

  it('switches on its own Room and no other', () => {
    const playing = advance(afterInteraction(), { type: 'music-source-toggled', room: 'cinema' });
    expect(isMusicSourceOn(playing, 'cinema')).toBe(true);
    expect(isMusicSourceOn(playing, 'entryway')).toBe(false);
  });
});

describe('Room Music and the Room the visitor is in', () => {
  /** The Entryway, with its Music Source switched on and playing. */
  const musicInTheEntryway = () => advance(afterInteraction(), { type: 'music-source-toggled', room: 'entryway' });

  const walkTo = (world: World, room: RoomId) =>
    advance(advance(world, { type: 'hash-changed', hash: roomHash(room) }), { type: 'room-transition-finished' });

  it('plays only the Room the visitor is in', () => {
    const both = advance(musicInTheEntryway(), { type: 'music-source-toggled', room: 'cinema' });
    expect(isRoomMusicAudible(both, 'entryway')).toBe(true);
    expect(isRoomMusicAudible(both, 'cinema')).toBe(false);
  });

  it('falls silent when the visitor leaves the Room', () => {
    const inTheGameRoom = walkTo(musicInTheEntryway(), 'games');
    expect(isAudible(inTheGameRoom, 'music')).toBe(false);
    expect(isRoomMusicAudible(inTheGameRoom, 'entryway')).toBe(false);
  });

  it('picks up again when the visitor comes back, because the Source is still on', () => {
    const inTheGameRoom = walkTo(musicInTheEntryway(), 'games');
    expect(isMusicSourceOn(inTheGameRoom, 'entryway')).toBe(true);

    const home = walkTo(inTheGameRoom, 'entryway');
    expect(isAudible(home, 'music')).toBe(true);
    expect(isRoomMusicAudible(home, 'entryway')).toBe(true);
  });
});

// 21: the Film tier has exactly one cause — a picture on the Cinema Room's
// screen — and the model derives it from the Cinema's own state on every tick.
// There is no event that starts it and there must not be one, because the next
// tick would overwrite whatever a caller set. So this file owns only the tier's
// resting state; every rule about it while a Film rolls, the header control
// included, is driven through the projector in `cinema.test.ts`.
describe('Film audio', () => {
  it('is silent until a Film is on the screen', () => {
    expect(isAudible(afterInteraction(), 'film')).toBe(false);
  });
});

describe('the header control as a veil over the tiers', () => {
  /** Everything this file can switch on: SFX by default, and one Room's music. */
  const everythingOn = () => advance(afterInteraction(), { type: 'music-source-toggled', room: 'entryway' });

  const mute = (world: World) => advance(world, { type: 'sound-toggled' });

  it('silences every tier at once', () => {
    const muted = mute(everythingOn());
    expect(isAudible(muted, 'sfx')).toBe(false);
    expect(isAudible(muted, 'music')).toBe(false);
    expect(isAudible(muted, 'film')).toBe(false);
    expect(isRoomMusicAudible(muted, 'entryway')).toBe(false);
  });

  it('leaves the Music Source switched on underneath, because it is not a reset', () => {
    expect(isMusicSourceOn(mute(everythingOn()), 'entryway')).toBe(true);
  });

  it('brings back exactly what was on when it is lifted', () => {
    const restored = mute(mute(everythingOn()));
    expect(isAudible(restored, 'sfx')).toBe(true);
    expect(isAudible(restored, 'music')).toBe(true);
  });

  it('brings back nothing that was off', () => {
    const restored = mute(mute(afterInteraction()));
    expect(isAudible(restored, 'music')).toBe(false);
    expect(isAudible(restored, 'film')).toBe(false);
    expect(isAudible(restored, 'sfx')).toBe(true);
  });
});

describe('what a new visit inherits', () => {
  it('starts silent whatever the last visit did, because sound is never stored', () => {
    const world = createWorld({ hash: '#/cinema', storedLanguage: 'en', reducedMotion: true });
    expect(isAudible(world, 'sfx')).toBe(false);
    expect(isAudible(world, 'film')).toBe(false);
    expect(soundIsOn(world)).toBe(true);
    for (const room of ROOM_IDS) expect(isMusicSourceOn(world, room)).toBe(false);
  });

  it('takes no notice of any interaction after the first', () => {
    const world = afterInteraction();
    expect(advance(world, { type: 'visitor-interacted' })).toBe(world);
  });
});
