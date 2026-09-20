import {
  ACTOR_IDS,
  ROOM_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  actorView,
  actorsIn,
  arrivalView, // 14: the Entryway
  catSfx, // 08: the cats
  isBeingPetted,
  isCat,
  motionIsOn,
  pettingBeat,
  type ActorId,
  type ActorView,
  type CatId,
  type CatsSlice,
  type CycleId,
  type Facing,
  type RoomId,
  type World,
} from '../world';
import { byId, type Dispatch, type Painter } from './painter';
import { playSfx } from './sound'; // 08: the cats

/**
 * Paint the Cast.
 *
 * Every decision here has already been made in `src/world/actors.ts`: where an
 * Actor is, which way it is turned, which Cycle it is playing and whether it is
 * moving at all. This file turns that into a sprite standing on a stage. It
 * chooses no routes, holds no positions of its own, and asks for the time only
 * so it can hand it back to the model on a tick.
 *
 * The Cycles themselves are declared in `index.html` rather than assembled from
 * strings here, which is what gets them preloaded and checked into the build.
 */

/** How long a gap the frame clock will believe, in milliseconds. */
const LONGEST_GAP_MS = 100;

/** One sheet an Actor can be painted from: a Cycle in one facing. */
interface Layer {
  readonly element: HTMLElement;
  readonly cycle: string;
  readonly facing: Facing;
  readonly frames: number;
  readonly columns: number;
  readonly rows: number;
  readonly fps: number;
  /** The sheet has loaded and its frame shape is known. */
  ready: boolean;
  /** One frame's width over its height, measured off the loaded sheet. */
  aspect: number;
}

/** One Actor on the page: its element, its sheets, and where its Cycle is up to. */
interface Sprite {
  readonly id: ActorId;
  readonly element: HTMLElement;
  /** How tall this Actor stands, in stage units. */
  readonly height: number;
  readonly layers: readonly Layer[];
  showing: Layer | null;
  frame: number;
  elapsed: number;
  moving: boolean;
}

const number = (element: HTMLElement, name: string, fallback: number) => {
  const value = Number(element.dataset[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const mountActors = (dispatch: Dispatch, initial: World): Painter => {
  let world = initial;
  const cast = byId('cast');
  const stages = new Map<RoomId, HTMLElement>(
    ROOM_IDS.map(room => [room, document.querySelector<HTMLElement>(`[data-stage="${room}"]`)!]),
  );

  const sprites: Sprite[] = [...cast.querySelectorAll<HTMLElement>('.actor')]
    .filter(element => (ACTOR_IDS as readonly string[]).includes(element.dataset.actor ?? ''))
    .map(element => {
      const layers = [...element.querySelectorAll<HTMLElement>('.cycle')].map(layer => {
        const frames = number(layer, 'frames', 1);
        const columns = Math.min(frames, number(layer, 'columns', 1));
        layer.hidden = true;
        return {
          element: layer,
          cycle: layer.dataset.cycle ?? 'walk',
          facing: layer.dataset.facing === 'left' ? 'left' : 'right',
          frames,
          columns,
          rows: Math.ceil(frames / columns),
          fps: number(layer, 'fps', 10),
          ready: false,
          aspect: 1,
        } satisfies Layer;
      });
      return {
        id: element.dataset.actor as ActorId,
        element,
        height: number(element, 'height', 300),
        layers,
        showing: null,
        frame: 0,
        elapsed: 0,
        moving: false,
      };
    });

  // 08: the three cats are the one part of the Cast the visitor can reach.
  // Each is a real `<button>` in `index.html`, so Enter, Space and a tap all
  // arrive here as one click and the focus ring is the browser's; the order
  // Tab visits them in is the order they were written, which is the order the
  // painter appends them to a stage in. The model decides what a fuss means.
  const petLayers = new Map<string, HTMLElement>(
    [...byId('apartment').querySelectorAll<HTMLElement>('[data-beat]')].map(layer => [layer.dataset.beat!, layer]),
  );
  for (const sprite of sprites) {
    if (!isCat(sprite.id)) continue;
    sprite.element.addEventListener('click', () => {
      dispatch({ type: 'cat-petted', cat: sprite.id as CatId, now: performance.now() });
    });
  }

  /**
   * The sheet this Actor should be painted from, and whether it has to be
   * flipped to get there.
   *
   * A Cycle with no artwork of its own falls back to the walk — running and
   * standing still both look better as a walk than as nothing. A facing with no
   * sheet of its own is mirrored, which is a fallback and not a free one: the
   * bible forbids flipping Míca, whose nose dot would change sides, so she
   * carries a sheet for each facing and never reaches this.
   */
  function resolve(sprite: Sprite, cycle: CycleId, facing: Facing) {
    const wanted = cycle === 'walk' ? [cycle] : [cycle, 'walk'];
    for (const want of wanted) {
      const exact = sprite.layers.find(layer => layer.ready && layer.cycle === want && layer.facing === facing);
      if (exact) return { layer: exact, mirrored: false };
    }
    for (const want of wanted) {
      const other = sprite.layers.find(layer => layer.ready && layer.cycle === want);
      if (other) return { layer: other, mirrored: true };
    }
    return null;
  }

  function paintFrame(sprite: Sprite) {
    const layer = sprite.showing;
    if (!layer) return;
    const column = sprite.frame % layer.columns;
    const row = Math.floor(sprite.frame / layer.columns);
    layer.element.style.backgroundPosition = `${
      layer.columns > 1 ? (column * 100) / (layer.columns - 1) : 0
    }% ${layer.rows > 1 ? (row * 100) / (layer.rows - 1) : 0}%`;
  }

  function show(sprite: Sprite, layer: Layer) {
    if (sprite.showing === layer) return;
    if (sprite.showing) sprite.showing.element.hidden = true;
    sprite.showing = layer;
    layer.element.hidden = false;
    layer.element.style.backgroundSize = `${layer.columns * 100}% ${layer.rows * 100}%`;
    sprite.element.style.aspectRatio = String(layer.aspect);
    // Carry the stride across rather than restarting it: turning round swaps
    // Míca onto her other sheet, and a Cycle that jumped back to its first
    // frame every time she changed her mind would read as a stumble.
    sprite.frame %= layer.frames;
    paintFrame(sprite);
  }

  /**
   * Stand the Actor on the stage.
   *
   * Everything is a percentage of the stage, so the apartment is the same place
   * at every width and nothing here has to watch for a resize: the stage keeps
   * its 16:9 shape in CSS and 1600 x 900 units map onto it. `z-index` off the
   * feet is what sorts the Cast by depth, and it is a reading of the position
   * rather than a decision about it.
   */
  function place(sprite: Sprite, view: ActorView, mirrored: boolean) {
    const style = sprite.element.style;
    style.left = `${(view.at.x / STAGE_WIDTH) * 100}%`;
    style.top = `${(view.at.y / STAGE_HEIGHT) * 100}%`;
    style.height = `${(sprite.height / STAGE_HEIGHT) * 100}%`;
    style.setProperty('--flip', mirrored ? '-1' : '1');
    style.zIndex = String(Math.round(view.at.y));
  }

  function park(sprite: Sprite) {
    if (sprite.element.parentElement !== cast) cast.append(sprite.element);
    sprite.moving = false;
  }

  /**
   * Put this Actor's element in its Room, in Cast order.
   *
   * 08: the three cats are focusable, so the order they sit in is the order Tab
   * visits them in, and that has to be the Character Sheet's rather than an
   * accident. Appending would give the order the sheets happened to finish
   * loading in — an Actor is not painted until its artwork has really arrived —
   * so each one is inserted ahead of the first Actor that comes after it in the
   * Cast and is already standing here. Only ever called when an Actor changes
   * Room, so nothing moves under a focus ring frame by frame.
   */
  function attach(sprite: Sprite, stage: HTMLElement) {
    if (sprite.element.parentElement === stage) return;
    const after = sprites.slice(sprites.indexOf(sprite) + 1).find(later => later.element.parentElement === stage);
    stage.insertBefore(sprite.element, after ? after.element : null);
  }

  let frameRequest = 0;
  let lastFrame = 0;
  const onScreen = new Set<RoomId>(ROOM_IDS);

  /**
   * Is there anything for the clock to do?
   *
   * Only while the Room the visitor is in has something to do, that Room's
   * stage is on screen, the tab is in front, and the visitor has not asked the
   * apartment to hold still. Anything else and the loop stops outright rather
   * than running to discover there is nothing to draw.
   *
   * 14: an arrival still playing counts as something to do even with nobody in
   * the Room, because an empty hall is where it starts: the Cast comes through
   * the door on the same clock that would otherwise have stopped waiting for it.
   */
  function needsClock() {
    const room = world.rooms.current;
    if (!motionIsOn(world) || document.hidden || !onScreen.has(room)) return false;
    return actorsIn(world, room).length > 0 || arrivalView(world).state === 'playing';
  }

  function startClock() {
    if (needsClock()) {
      if (!frameRequest) frameRequest = requestAnimationFrame(tick);
    } else if (frameRequest) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      lastFrame = 0;
    }
  }

  /** Step each playing Cycle. Nothing here moves an Actor; the model does that. */
  function advanceCycles(now: number) {
    const elapsed = lastFrame ? Math.min(now - lastFrame, LONGEST_GAP_MS) : 0;
    lastFrame = now;
    for (const sprite of sprites) {
      const layer = sprite.showing;
      if (!layer || layer.frames < 2) continue;
      if (!sprite.moving) {
        // Standing still is the Cycle's first frame held, not a frozen stride.
        if (sprite.frame === 0) continue;
        sprite.frame = 0;
        sprite.elapsed = 0;
        paintFrame(sprite);
        continue;
      }
      sprite.elapsed += elapsed;
      const perFrame = 1000 / layer.fps;
      while (sprite.elapsed >= perFrame) {
        sprite.elapsed -= perFrame;
        sprite.frame = (sprite.frame + 1) % layer.frames;
      }
      paintFrame(sprite);
    }
  }

  function tick(now: number) {
    frameRequest = 0;
    // The model is handed the time and gives back where everyone got to. It may
    // paint us from inside this call, which is why the frame is booked after.
    dispatch({ type: 'actor-tick', now });
    advanceCycles(now);
    startClock();
  }

  // A sheet is painted only once it has really arrived, so an Actor never shows
  // up as an empty box on a slow connection.
  for (const sprite of sprites) {
    for (const layer of sprite.layers) {
      const sheet = layer.element.dataset.sheet;
      if (!sheet) continue;
      const warm = new Image();
      warm.addEventListener(
        'load',
        () => {
          layer.aspect = warm.naturalWidth / layer.columns / (warm.naturalHeight / layer.rows);
          layer.element.style.backgroundImage = `url("${sheet}")`;
          layer.ready = true;
          paint(world);
        },
        { once: true },
      );
      warm.src = sheet;
    }
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const room = (entry.target as HTMLElement).dataset.stage as RoomId;
          if (entry.isIntersecting) onScreen.add(room);
          else onScreen.delete(room);
        }
        lastFrame = 0;
        startClock();
      },
      { rootMargin: '80px', threshold: 0 },
    );
    for (const stage of stages.values()) observer.observe(stage);
  }

  document.addEventListener('visibilitychange', () => {
    lastFrame = 0;
    startClock();
  });

  // 08: the cats. The slice changes identity on the tick that names a meow and
  // again on the one that forgets it, so watching it plays each one exactly
  // once — and a repaint from a sheet finishing its load replays nothing.
  let heard: CatsSlice | null = null;

  /**
   * Play the petting Beat over a cat, if a sheet for it has been delivered.
   *
   * Named by the model and skipped when `index.html` declares no layer for it,
   * which is ticket 14's arrangement for the arrival: the fuss then degrades to
   * the cat stopping where she is rather than to a cat that vanishes. Nothing
   * here invents a `data-sheet` for a file that is not on disk.
   */
  function playPetting(sprite: Sprite, view: ActorView): boolean {
    const layer = petLayers.get(pettingBeat(sprite.id as CatId));
    if (!layer) return false;
    const width = sprite.height * (sprite.showing?.aspect ?? 1);
    const style = layer.style;
    style.setProperty('--x', String(view.at.x - width / 2));
    style.setProperty('--y', String(view.at.y - sprite.height));
    style.setProperty('--w', String(width));
    style.setProperty('--h', String(sprite.height));
    style.setProperty('--z', String(Math.round(view.at.y)));
    if (layer.parentElement !== sprite.element.parentElement) sprite.element.parentElement?.append(layer);
    layer.hidden = false;
    return true;
  }

  function paint(next: World) {
    world = next;
    if (next.cats !== heard) {
      heard = next.cats;
      for (const name of catSfx(next)) playSfx(name);
    }
    for (const sprite of sprites) {
      const view = actorView(world, sprite.id);
      const resolved = view && resolve(sprite, view.cycle, view.facing);
      if (!view || !resolved) {
        park(sprite);
        continue;
      }
      attach(sprite, stages.get(view.room)!);
      show(sprite, resolved.layer);
      place(sprite, view, resolved.mirrored);
      sprite.moving = view.moving;
      // 08: a cat being fussed over. The class is what the stylesheet reads;
      // the Beat, if one has been drawn, stands in for the sprite as the
      // arrival's Beats do for the Cast they draw.
      if (!isCat(sprite.id)) continue;
      const petted = isBeingPetted(world, sprite.id as CatId);
      sprite.element.classList.toggle('is-petted', petted);
      // `is-fussed` rather than the arrival's `is-acted`, because the Entryway
      // painter owns that one and the two must never argue over a cat.
      const acted = petted && playPetting(sprite, view);
      sprite.element.classList.toggle('is-fussed', acted);
      if (!acted) {
        const layer = petLayers.get(pettingBeat(sprite.id as CatId));
        if (layer) layer.hidden = true;
      }
    }
    startClock();
  }

  return paint;
};
