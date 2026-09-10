import { describe, expect, it } from 'vitest';

import { advance, createWorld, isInteractive, loadingProgress, type World, type WorldInputs } from './index';

/** A visitor arriving with nothing stored, no reduced-motion request, no hash. */
const plainArrival: WorldInputs = { hash: '', storedLanguage: null, reducedMotion: false };

const declaring = (urls: readonly string[]): World =>
  advance(createWorld(plainArrival), { type: 'assets-declared', urls });

describe('the gate on the apartment', () => {
  it('holds the visitor at the door until the page has said what there is to load', () => {
    const arriving = createWorld(plainArrival);
    expect(isInteractive(arriving)).toBe(false);
    expect(loadingProgress(arriving)).toBe(0);
  });

  it('opens at once for an apartment with nothing to load', () => {
    const empty = declaring([]);
    expect(isInteractive(empty)).toBe(true);
    expect(loadingProgress(empty)).toBe(1);
  });
});

/** The nine files the Rooms are painted with, in miniature. */
const four = ['entryway.webp', 'games.gif', 'games.webp', 'games-sprite.webp'];

const arriving = (world: World, ...urls: readonly string[]): World =>
  urls.reduce<World>((next, url) => advance(next, { type: 'asset-settled', url, outcome: 'loaded' }), world);

describe('progress through the preload', () => {
  it('moves a step for each asset that really arrives', () => {
    const declared = declaring(four);
    expect(loadingProgress(declared)).toBe(0);
    expect(loadingProgress(arriving(declared, 'entryway.webp'))).toBe(0.25);
    expect(loadingProgress(arriving(declared, 'entryway.webp', 'games.gif'))).toBe(0.5);
  });

  it('holds the gate shut while a single asset is still outstanding', () => {
    const three = arriving(declaring(four), 'entryway.webp', 'games.gif', 'games.webp');
    expect(loadingProgress(three)).toBe(0.75);
    expect(isInteractive(three)).toBe(false);

    const all = arriving(three, 'games-sprite.webp');
    expect(loadingProgress(all)).toBe(1);
    expect(isInteractive(all)).toBe(true);
  });
});

describe('an asset that never arrives', () => {
  it('settles like any other, so one broken URL cannot hold the door shut forever', () => {
    const world = advance(declaring(['gone.webp']), { type: 'asset-settled', url: 'gone.webp', outcome: 'failed' });
    expect(loadingProgress(world)).toBe(1);
    expect(isInteractive(world)).toBe(true);
  });

  it('is remembered as a failure, while the assets that arrived are not', () => {
    const declared = declaring(['gone.webp', 'games.webp']);
    const failed = advance(declared, { type: 'asset-settled', url: 'gone.webp', outcome: 'failed' });
    const world = arriving(failed, 'games.webp');
    expect(world.loading.failed).toEqual(['gone.webp']);
    expect(world.loading.settled).toEqual(['gone.webp', 'games.webp']);
  });
});

describe('what the apartment refuses to count', () => {
  it('counts one asset once, however many times the page reports it settling', () => {
    const once = arriving(declaring(four), 'games.gif');
    expect(arriving(once, 'games.gif')).toBe(once);
    expect(loadingProgress(once)).toBe(0.25);
  });

  it('ignores an asset nobody declared', () => {
    const declared = declaring(four);
    expect(arriving(declared, 'kitchen.webp')).toBe(declared);
  });

  it('ignores an asset settling before anything was declared', () => {
    const atTheDoor = createWorld(plainArrival);
    expect(arriving(atTheDoor, 'games.gif')).toBe(atTheDoor);
  });

  it('waits once for a picture the Rooms use twice', () => {
    const declared = declaring(['games.gif', 'games.gif', 'games.webp']);
    expect(loadingProgress(arriving(declared, 'games.gif'))).toBe(0.5);
    expect(isInteractive(arriving(declared, 'games.gif', 'games.webp'))).toBe(true);
  });

  it('keeps the list it was first given, so a later declaration cannot shut the door again', () => {
    const loaded = arriving(declaring(['games.gif']), 'games.gif');
    expect(isInteractive(loaded)).toBe(true);
    expect(advance(loaded, { type: 'assets-declared', urls: ['late.mp3'] })).toBe(loaded);
  });
});
