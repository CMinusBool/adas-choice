import {
  ACTOR_IDS,
  ROOM_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  actorView,
  actorsIn,
  motionIsOn,
  type ActorId,
  type ActorView,
  type CycleId,
  type Facing,
  type RoomId,
  type World,
} from '../world';
import { byId, type Dispatch, type Painter } from './painter';

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

  let frameRequest = 0;
  let lastFrame = 0;
  const onScreen = new Set<RoomId>(ROOM_IDS);

  /**
   * Is there anything for the clock to do?
   *
   * Only while the Room the visitor is in has somebody in it, that Room's stage
   * is on screen, the tab is in front, and the visitor has not asked the
   * apartment to hold still. Anything else and the loop stops outright rather
   * than running to discover there is nothing to draw.
   */
  function needsClock() {
    const room = world.rooms.current;
    return motionIsOn(world) && !document.hidden && onScreen.has(room) && actorsIn(world, room).length > 0;
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

  function paint(next: World) {
    world = next;
    for (const sprite of sprites) {
      const view = actorView(world, sprite.id);
      const resolved = view && resolve(sprite, view.cycle, view.facing);
      if (!view || !resolved) {
        park(sprite);
        continue;
      }
      const stage = stages.get(view.room)!;
      if (sprite.element.parentElement !== stage) stage.append(sprite.element);
      show(sprite, resolved.layer);
      place(sprite, view, resolved.mirrored);
      sprite.moving = view.moving;
    }
    startClock();
  }

  return paint;
};
