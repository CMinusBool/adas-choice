// 07: actors
import {
  DEFAULT_SEED,
  actorViewsIn,
  catPlaces, // 08: the cats
  clearRoom,
  createActors,
  findActorView,
  gatherCats, // 08: the cats
  gatherInto, // 17: cinema
  haltActor, // 08: the cats
  placeActor,
  seededRandom,
  sendActor,
  settleActors,
  tickActors,
  type ActorId,
  type ActorView,
  type ActorsSlice,
  type CycleId,
  type RandomSource,
} from './actors';
// 16: the Activity Room
import {
  createActivities,
  withActivityChosen,
  withCardClosed,
  withCardOpened,
  type ActivitiesSlice,
  type ActivityId,
} from './activities';
// 08: the three cats, who decide for themselves where to be and when to meow.
import {
  arriveCats,
  createCats,
  isPetted,
  petCats,
  tickCats,
  type BreakableId,
  type CatId,
  type CatsSlice,
} from './cats';
import { resolveLanguage, toggleLanguage, type Language } from './language';
// 05: loading
import { createLoading, declareAssets, everythingSettled, progressOf, settleAsset, type AssetOutcome, type LoadingSlice } from './loading';
import { createMotion, toggleMotion, withReducedMotion, type MotionSlice } from './motion';
// 45: the Game Room's three Portals — which one is awake, and which one a
// narrow wall has room for.
import {
  createPortals,
  steppedPortal,
  withPortalAttended,
  withPortalChosen,
  withPortalClosed,
  withPortalOpened,
  type PortalId,
  type PortalsSlice,
} from './portals';
import { ENTRYWAY, parseRoute, type RoomId } from './rooms';
// 17: cinema — the Cinema Room's own marks and shelves.
// 18: and the errand that fetches Posters off one of them.
import {
  CINEMA_MARKS,
  boyMark,
  cinemaAwaitsClock,
  createCinema,
  expandedPosterOf,
  isOnMark,
  loadedReelOf,
  openShelfOf,
  readableFilmOf,
  rollingFilmOf,
  seatOf,
  settleCinema,
  stepCinema,
  tickPoster,
  withAttendedPoster,
  withAttendedShelf,
  withChosenFilm,
  withChosenShelf,
  withGateToggled,
  type CinemaShelf,
  type CinemaSlice,
  type CinemaStep,
} from './cinema';
// 18: films. 19: and the details one of them reads out when its Poster opens.
import type { Film, FilmId } from './films';
// 06: audio
import { createAudio, isMusicSourceSwitchedOn, withFilmAudio, withInteraction, withMusicSourceToggled, withSoundToggled, type AudioSlice, type AudioTier } from './audio';
// end 06
// 07: actors
import type { Point } from './stage';
// 14: the Entryway — the arrival, and the Room's Props and its Breakable.
import {
  createArrival,
  finishArrival,
  propsAt,
  startArrival,
  tickArrival,
  viewArrival,
  type ArrivalCue,
  type ArrivalSlice,
  type ArrivalView,
} from './arrival';
import { type EntrywayProps, type VaseState } from './entryway';

/**
 * How the visitor is moving between Rooms right now.
 *
 * `animated` is the DOM layer's licence to wait for the transition to end;
 * `instant` is its instruction not to, because a zero-length CSS animation the
 * layer waits on is a Room that never finishes arriving.
 */
export type TransitionKind = 'settled' | 'instant' | 'animated';

/** Which Room the visitor is in, and which one they are still leaving. */
export interface RoomsSlice {
  /** The Room the visitor is in. */
  readonly current: RoomId;
  /** The Room being left, still painted until the transition ends. */
  readonly leaving: RoomId | null;
  readonly transition: TransitionKind;
}

/**
 * The whole world, as named slices.
 *
 * Every slice is plain readonly data: the DOM layer reads it and paints. New
 * behaviour arrives as a new slice beside these, an event in `WorldEvent`, and
 * a painter in the DOM layer — not as a decision moved out of here.
 */
export interface World {
  readonly language: Language;
  readonly motion: MotionSlice;
  readonly rooms: RoomsSlice;
  // 05: loading
  readonly loading: LoadingSlice;
  // 06: audio
  readonly audio: AudioSlice;
  // end 06
  // 07: actors
  readonly actors: ActorsSlice;
  // 08: what the three cats have decided to do next
  readonly cats: CatsSlice;
  // 17: cinema
  readonly cinema: CinemaSlice;
  // 16: the Activity Room
  readonly activities: ActivitiesSlice;
  // 45: the Game Room's three Portals
  readonly portals: PortalsSlice;
  // 14: the Entryway
  readonly arrival: ArrivalSlice;
  /** Every Breakable the apartment holds, broken so far. Persists across a reload. */
  readonly broken: ReadonlySet<BreakableId>;
}

/** What the DOM layer knows at start-up that the model cannot ask for itself. */
export interface WorldInputs {
  /** `location.hash`, exactly as the browser reports it. */
  readonly hash: string;
  /** Whatever storage returned for the language preference, or `null`. */
  readonly storedLanguage: string | null | undefined;
  /** Whether the visitor's system asks for reduced motion. */
  readonly reducedMotion: boolean;
  // 07: actors — where the Cast's own decisions get their dice. The DOM layer
  // seeds this from the clock; a test seeds it with a number and gets the same
  // apartment twice. Left out, the world is the same on every visit.
  readonly random?: RandomSource;
  // 14: the Entryway — whether this tab has already been shown the arrival.
  // Read out of session storage by the DOM layer, because the model may not ask.
  readonly arrived?: boolean;
  // 09: the Breakables already broken this session, read out of session storage
  // the same way — a new tab finds every one of them whole.
  readonly brokenBreakables?: readonly BreakableId[];
}

/**
 * Something the DOM layer has observed.
 *
 * The DOM layer reports; it never decides. Every browser event the page listens
 * for turns into one of these, and `advance` works out what it means.
 */
export type WorldEvent =
  | { readonly type: 'hash-changed'; readonly hash: string }
  | { readonly type: 'room-transition-finished' }
  | { readonly type: 'motion-toggled' }
  | { readonly type: 'reduced-motion-changed'; readonly reducedMotion: boolean }
  | { readonly type: 'language-toggled' }
  // 05: loading — what there is to preload, and each asset as it arrives.
  | { readonly type: 'assets-declared'; readonly urls: readonly string[] }
  | { readonly type: 'asset-settled'; readonly url: string; readonly outcome: AssetOutcome }
  // 06: audio
  | { readonly type: 'visitor-interacted' }
  | { readonly type: 'sound-toggled' }
  | { readonly type: 'music-source-toggled'; readonly room: RoomId }
  // end 06
  // 07: actors — `now` is how time reaches the model; it never asks for it.
  // 14: the Entryway — the DOM layer starts the arrival 0.6 s after the loading
  // screen's reveal settles, which is a moment only the page can know about.
  | { readonly type: 'arrival-started' }
  | { readonly type: 'breakable-broken'; readonly breakable: BreakableId }
  | { readonly type: 'actor-tick'; readonly now: number }
  | {
      readonly type: 'actor-sent';
      readonly actor: ActorId;
      readonly goal: Point;
      readonly cycle?: Extract<CycleId, 'walk' | 'run'>;
    }
  // 17: cinema — which bookshelf the visitor's pointer or focus is on, or
  // `null` for none. What it means for the Boy is the model's decision.
  | { readonly type: 'cinema-shelf-attended'; readonly shelf: CinemaShelf | null }
  // 16: the Activity Room — reading a station's card, and picking it.
  | { readonly type: 'activity-card-opened'; readonly activity: ActivityId }
  | { readonly type: 'activity-card-closed' }
  | { readonly type: 'activity-chosen'; readonly activity: ActivityId }
  // 18: cinema — a bookshelf clicked or activated. `now` is the clock the
  // errand's Beats are timed against; it is the same reading the ticks carry,
  // because the model is never allowed to ask what time it is.
  | { readonly type: 'cinema-shelf-chosen'; readonly shelf: CinemaShelf; readonly now: number }
  // 19: cinema — the pinned Poster the visitor's pointer or focus is on, or
  // `null` for none. Hover and focus are the same report, because they are the
  // same thing happening: the visitor is looking at that Poster.
  | { readonly type: 'cinema-poster-attended'; readonly film: FilmId | null; readonly now: number }
  // 08: a cat clicked, tapped or activated from the keyboard. `now` is the same
  // reading the ticks carry, because the fuss is timed and the model is never
  // allowed to ask what time it is.
  | { readonly type: 'cat-petted'; readonly cat: CatId; readonly now: number }
  // 20: cinema — the details card's primary action. This is the explicit act
  // the whole evening turns on: he goes for the reel and the Film tier is
  // allowed to make a sound, which is why nothing before it ever plays one.
  | { readonly type: 'cinema-film-chosen'; readonly film: FilmId; readonly now: number }
  // 45: the Game Room — the Portal the visitor's pointer or focus is on, or
  // `null` for none. Hover and focus are one report, as they are for a Poster:
  // both mean the visitor is at that Portal, and the world inside it wakes.
  | { readonly type: 'portal-attended'; readonly portal: PortalId | null }
  // 45: which Portal the wall carries where it only has room for one — a dot
  // clicked, and the arrow keys or a step either side of it.
  | { readonly type: 'portal-chosen'; readonly portal: PortalId }
  | { readonly type: 'portal-stepped'; readonly step: number }
  // 46: a Portal is a button that expands, so this is the click, the tap, the
  // Enter and the Space on one — and Escape, the close button and the scrim
  // are the one way back out of it.
  | { readonly type: 'portal-opened'; readonly portal: PortalId }
  | { readonly type: 'portal-closed' }
  // 20: cinema — the projector's gate lever, the machine's other affordance.
  // It says nothing about what it wants done: a Film on the screen is stopped
  // and a threaded reel is rolled, and which of the two is the model's answer.
  | { readonly type: 'projector-gate-toggled'; readonly now: number };

/** Build the world the visitor arrives into. */
export function createWorld(inputs: WorldInputs): World {
  const arriving = parseRoute(inputs.hash);
  return {
    language: resolveLanguage(inputs.storedLanguage),
    motion: createMotion(inputs.reducedMotion),
    rooms: { current: arriving, leaving: null, transition: 'settled' },
    // 05: loading
    loading: createLoading(),
    // 06: audio — nothing about sound survives the visit, so it takes no input.
    audio: createAudio(),
    // end 06
    // 07: actors
    // 17: the Room the visitor arrives in places its own Cast, so walking
    // straight in at `#/cinema` still finds the two of them sat down.
    actors: createActors(inputs.random ?? seededRandom(DEFAULT_SEED), arriving),
    // 08: nobody has decided anything yet; the first tick tells them the time.
    cats: createCats(),
    // 17: cinema
    cinema: createCinema(),
    // 16: the Activity Room — nothing about tonight's pick survives the visit,
    // so it takes no input either.
    activities: createActivities(),
    // 45: the Game Room's wall, at rest and on the first of the three Portals.
    portals: createPortals(),
    // 14: the Entryway. The arrival is over before it starts for a visitor who
    // has already had it, who asked for stillness, or who opened the page in
    // another Room — all three find the Cast at home in the settled tableau.
    arrival: createArrival(
      inputs.arrived === true || inputs.reducedMotion || parseRoute(inputs.hash) !== ENTRYWAY,
    ),
    broken: new Set(inputs.brokenBreakables ?? []),
  };
}

/**
 * The world after one reported event.
 *
 * Returns the world it was given, by identity, when the event changes nothing —
 * so the DOM layer can skip a repaint, and so the hash we write ourselves does
 * not bounce back as a second transition.
 */
export function advance(world: World, event: WorldEvent): World {
  switch (event.type) {
    case 'hash-changed': {
      const entering = parseRoute(event.hash);
      if (entering === world.rooms.current) return world;
      // The model decides whether this move animates, so the DOM layer never
      // waits on an animation that was never going to run.
      const transition: TransitionKind = motionIsOn(world) ? 'animated' : 'instant';
      // 14: leaving the Entryway mid-arrival settles it, so the visitor never
      // comes back to find it half done.
      const moved = {
        ...world,
        rooms: { current: entering, leaving: world.rooms.current, transition },
        // 17: the Room being walked into puts its own Cast back on their
        // marks, so every Room is found the way its design note describes it.
        // 08: and the three cats come with the visitor, onto whichever of that
        // Room's marks are free, so they are the same three animals throughout.
        actors: gatherCats(gatherInto(world.actors, entering), entering),
        // A mark is a place in one Room, so whatever a cat was heading for is
        // forgotten at the door. Everything else about it comes along.
        cats: arriveCats(world.cats),
        // 17: a shelf cannot hold the attention of a visitor who has walked
        // out. 18: the errand he was on finishes rather than being abandoned,
        // so the wall they come back to shows the Posters he went to fetch.
        cinema: settleCinema(world.cinema),
        // 45: and no Portal is still awake on a wall nobody is looking at,
        // so the Game Room is found at rest however it was left. 46: an
        // expansion closes on the way out too, which is what makes the back
        // button close it — the Room is never walked back into mid-expansion.
        portals: withPortalClosed(withPortalAttended(world.portals, null)),
      };
      // 20: and a Film that was rolling falls silent on the way out, because
      // the Bumper is a Cinema Room moment rather than something that follows
      // the visitor down the hall.
      return runCinema(entering === ENTRYWAY ? moved : withArrivalOver(moved), null);
    }
    case 'room-transition-finished': {
      if (world.rooms.transition === 'settled') return world;
      return { ...world, rooms: { current: world.rooms.current, leaving: null, transition: 'settled' } };
    }
    case 'motion-toggled': {
      // 07: actors — a walk in progress ends at its destination rather than
      // freezing halfway across the floor.
      const motion = toggleMotion(world.motion);
      const actors = motion.paused ? settleActors(world.actors) : world.actors;
      // 14: pausing motion mid-arrival completes it, the way a walk settles.
      // 18: and an errand in progress ends with its Posters on the wall rather
      // than with the Boy standing at a shelf holding three tubes for ever.
      return runCinema(withArrivalOver({ ...world, motion, actors }), null);
    }
    case 'reduced-motion-changed': {
      const motion = withReducedMotion(world.motion, event.reducedMotion);
      if (motion === world.motion) return world;
      // 07: actors. 18: and the errand settles with them.
      const actors = motion.paused ? settleActors(world.actors) : world.actors;
      const stilled = { ...world, motion, actors };
      // 14: the arrival is motion, so a system that starts asking for stillness
      // mid-way gets its outcome rather than the rest of it.
      return runCinema(motion.paused ? withArrivalOver(stilled) : stilled, null);
    }
    case 'language-toggled': {
      return { ...world, language: toggleLanguage(world.language) };
    }
    // 05: loading — both report rather than decide, and both can be a report the
    // model has nothing to do with: an asset declared twice, or settling twice.
    case 'assets-declared': {
      const loading = declareAssets(world.loading, event.urls);
      return loading === world.loading ? world : { ...world, loading };
    }
    case 'asset-settled': {
      const loading = settleAsset(world.loading, event.url, event.outcome);
      return loading === world.loading ? world : { ...world, loading };
    }
    // 06: audio
    case 'visitor-interacted': {
      const audio = withInteraction(world.audio);
      return audio === world.audio ? world : { ...world, audio };
    }
    case 'sound-toggled': {
      return { ...world, audio: withSoundToggled(world.audio) };
    }
    case 'music-source-toggled': {
      return { ...world, audio: withMusicSourceToggled(world.audio, event.room) };
    }
    // end 06
    // 07: actors
    case 'actor-tick': {
      // 14: the arrival runs on the same clock, and hands back what it wants
      // done to the Cast; `actors.ts` still owns the walking itself.
      const stepped = tickArrival(world.arrival, event.now);
      const after = stepped.arrival === world.arrival ? world : { ...world, arrival: stepped.arrival };
      const cued = applyCues(after, stepped.cues, motionIsOn(after));
      const actors = tickActors(cued.actors, event.now, motionIsOn(cued));
      const ticked = actors === cued.actors ? cued : { ...cued, actors };
      // 18: the same tick is the Cinema Room's clock: the errand's Beats end
      // on it, and so does each leg of the walk it is waiting on.
      // 08: and the same tick is the cats' clock: it is when one of them thinks
      // of somewhere else to be, arrives, finishes a fuss, or meows. The Cinema's
      // own clock runs after them, on the world the cats have already moved.
      return runCinema(roamCats(ticked, event.now), event.now);
    }
    // 07: actors
    // 14: the Entryway
    case 'arrival-started': {
      const arrival = startArrival(world.arrival);
      if (arrival === world.arrival) return world;
      // The hall the arrival opens on is empty: nobody is home until they come
      // through the door, and an Actor nobody has placed has nowhere to be.
      return { ...world, arrival, actors: clearRoom(world.actors, ENTRYWAY) };
    }
    // 09: a Breakable going over. The roll that decides when lives in
    // `roamCats` below; this event is the general answer either it or a test
    // can reach for, and it is a no-op for one already broken.
    case 'breakable-broken': {
      return withBreakableBroken(world, event.breakable);
    }
    case 'actor-sent': {
      const actors = sendActor(world.actors, event.actor, event.goal, event.cycle ?? 'walk', motionIsOn(world));
      return actors === world.actors ? world : { ...world, actors };
    }
    // 17: cinema — a shelf catching the visitor's eye is what sends the Boy
    // over to it, and losing it is what sends him back to his beanbag. A
    // report from anywhere but the Cinema Room means nothing here.
    case 'cinema-shelf-attended': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withAttendedShelf(world.cinema, event.shelf);
      if (cinema === world.cinema) return world;
      // 18: attention still lights the shelf up while he is on an errand, but
      // it stops moving him: a pointer wandering across the Room mid-rummage
      // would otherwise strand him halfway through it.
      if (world.cinema.step !== 'seated') return { ...world, cinema };
      const actors = sendActor(world.actors, 'boy', boyMark(event.shelf), 'walk', motionIsOn(world));
      return { ...world, cinema, actors };
    }
    // 18: cinema — a bookshelf chosen. Whatever he was doing, he goes to this
    // shelf, rummages in it, and pins its three Posters to the board.
    case 'cinema-shelf-chosen': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withChosenShelf(world.cinema, event.shelf);
      const actors = sendActor(world.actors, 'boy', CINEMA_MARKS.shelves[event.shelf], 'walk', motionIsOn(world));
      return runCinema({ ...world, cinema, actors }, event.now);
    }
    // 19: cinema — a Poster looked at. Nothing else in the Room moves for it:
    // the expansion is the Poster's own, and the Boy stays where he is.
    case 'cinema-poster-attended': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withAttendedPoster(world.cinema, event.film, event.now, motionIsOn(world));
      return cinema === world.cinema ? world : { ...world, cinema };
    }
    // 20: cinema — a Film chosen. He hurries to the cabinet for its reel, and
    // the Room's one state machine carries him from there to the Bumper.
    case 'cinema-film-chosen': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withChosenFilm(world.cinema, event.film);
      if (cinema === world.cinema) return world;
      const actors = sendActor(world.actors, 'boy', CINEMA_MARKS.cabinet, 'run', motionIsOn(world));
      return runCinema({ ...world, cinema, actors }, event.now);
    }
    // 20: cinema — the gate lever. Nobody moves for it: the reel is already
    // threaded, so this only starts or stops the picture on the screen.
    case 'projector-gate-toggled': {
      if (world.rooms.current !== 'cinema') return world;
      const cinema = withGateToggled(world.cinema, event.now);
      return cinema === world.cinema ? world : runCinema({ ...world, cinema }, event.now);
    }
    // 08: a cat fussed over. Only a cat that is actually in the Room the
    // visitor is in: one still in the backpack has no ear to scratch.
    case 'cat-petted': {
      const view = findActorView(world.actors, event.cat);
      if (!view || view.room !== world.rooms.current) return world;
      return {
        ...world,
        cats: petCats(world.cats, event.cat, event.now, motionIsOn(world)),
        // She stops under the hand rather than finishing the walk she was on.
        actors: motionIsOn(world) ? haltActor(world.actors, event.cat) : world.actors,
      };
    }
    // 16: the Activity Room
    case 'activity-card-opened':
    case 'activity-card-closed':
    case 'activity-chosen': {
      const activities =
        event.type === 'activity-card-opened'
          ? withCardOpened(world.activities, event.activity)
          : event.type === 'activity-card-closed'
            ? withCardClosed(world.activities)
            : withActivityChosen(world.activities, event.activity);
      return activities === world.activities ? world : { ...world, activities };
    }
    // 45: the Game Room's three Portals. Every one of these is about a wall
    // the visitor is standing in front of, so a report from anywhere else in
    // the apartment is a stale listener and means nothing.
    case 'portal-attended':
    case 'portal-chosen':
    case 'portal-stepped':
    case 'portal-opened':
    case 'portal-closed': {
      if (world.rooms.current !== 'games') return world;
      const portals =
        event.type === 'portal-attended'
          ? withPortalAttended(world.portals, event.portal)
          : event.type === 'portal-chosen'
            ? withPortalChosen(world.portals, event.portal)
            : event.type === 'portal-stepped'
              ? steppedPortal(world.portals, event.step)
              : event.type === 'portal-opened'
                ? withPortalOpened(world.portals, event.portal)
                : withPortalClosed(world.portals);
      return portals === world.portals ? world : { ...world, portals };
    }
  }
}

// 08: the cats
/**
 * The world with the three cats one tick further into their afternoon.
 *
 * Only the Room the visitor is in: a cat nobody can see has nothing to decide,
 * and its clock starts again from the moment they walk back in. Roaming is
 * motion, so an apartment asked to hold still has three cats sitting exactly
 * where they were — and roaming starts when the arrival is over, because until
 * then the three of them are in a backpack on the Boy's back.
 */
function roamCats(world: World, now: number): World {
  if (!motionIsOn(world) || world.arrival.state !== 'done') return world;
  const room = world.rooms.current;
  const stepped = tickCats(world.cats, room, catPlaces(world.actors, room), now, world.actors.random, world.broken);
  let actors = world.actors;
  for (const send of stepped.sends) actors = sendActor(actors, send.cat, send.goal, 'walk', true);
  // 09: every Breakable a cat knocked down this tick, folded into what the
  // apartment remembers. `tickCats` only ever offers a cat her own, in her
  // own Room, still intact, so nothing here has to check ownership again.
  let broken: ReadonlySet<BreakableId> = world.broken;
  if (stepped.knocked.some(id => !world.broken.has(id))) {
    const next = new Set(world.broken);
    for (const id of stepped.knocked) next.add(id);
    broken = next;
  }
  if (stepped.slice === world.cats && actors === world.actors && broken === world.broken) return world;
  return { ...world, cats: stepped.slice, actors, broken };
}

// 18: cinema
/**
 * How far the Cinema Room's errand can get right now.
 *
 * Each turn of the loop asks the Room what the Boy's position and the clock
 * mean for it, and carries out the one move it asks for. With motion on that is
 * at most one step a frame, because every step that follows is waiting on a
 * walk or a Beat that has only just started. With motion off nothing waits: the
 * loop runs the whole errand out in this one call, which is how the Posters
 * still reach the wall for a visitor who asked the apartment to hold still.
 */
// 19: cinema
/**
 * The Cinema Room's clock, in one call.
 *
 * Two things in this Room run on time — the Boy's errand and the expansion of
 * a Poster — and every moment that reaches one reaches the other: a tick, a
 * motion preference changing, a shelf chosen. Keeping them behind one function
 * is what stops a caller remembering only half of that.
 */
function runCinema(world: World, now: number | null): World {
  const ran = runErrand(world, now);
  // 20: a picture on the screen is the Film tier playing, and the model is
  // what says so. It sits between the two because the errand is what starts
  // and stops the picture, and because a Film has to fall silent even in the
  // one case the line below returns early on: the Room the visitor just left.
  const sounded = withFilmSound(ran);
  if (sounded.rooms.current !== 'cinema') return sounded;
  const cinema = tickPoster(sounded.cinema, now, motionIsOn(sounded));
  return cinema === sounded.cinema ? sounded : { ...sounded, cinema };
}

/**
 * The world with the Film tier matching what is on the screen.
 *
 * Ticket 06 modelled the tier and left it to be switched on by whatever
 * started a Film; this is that. Nothing in the DOM layer has to remember to
 * report it, which matters because §9's rule about the Room Music hangs off
 * the same flag and a forgotten report would be two clatters at once.
 */
function withFilmSound(world: World): World {
  const rolling = world.rooms.current === 'cinema' && rollingFilmOf(world.cinema) !== null;
  const audio = withFilmAudio(world.audio, rolling);
  return audio === world.audio ? world : { ...world, audio };
}

function runErrand(world: World, now: number | null): World {
  if (world.rooms.current !== 'cinema' || world.cinema.step === 'seated') return world;
  const motionOn = motionIsOn(world);
  let next = world;
  // The two sequences are fifteen steps between them, so a loop that has not
  // settled by twice that is one that never will; the bound is a guard, not a
  // schedule.
  for (let turn = 0; turn < 32; turn += 1) {
    const boy = findActorView(next.actors, 'boy');
    if (!boy) return next;
    const progress = stepCinema(next.cinema, { at: boy.at, moving: boy.moving }, now, motionOn);
    if (progress.slice === next.cinema && progress.sendBoyTo === null) return next;
    const actors = progress.sendBoyTo
      ? sendActor(next.actors, 'boy', progress.sendBoyTo, progress.cycle, motionOn)
      : next.actors;
    next = { ...next, cinema: progress.slice, actors };
  }
  return next;
}

// 05: loading
/**
 * Is the apartment ready for the visitor?
 *
 * False until every declared asset has settled, which is what holds the loading
 * screen up and keeps the apartment behind it out of reach.
 */
export function isInteractive(world: World): boolean {
  return everythingSettled(world.loading);
}

/** How far the preload has got, from 0 to 1, for the indicator to paint. */
export function loadingProgress(world: World): number {
  return progressOf(world.loading);
}

// 06: audio
/**
 * May the visitor hear this tier right now?
 *
 * The one question the DOM layer's playback adapter asks before it plays
 * anything. Nothing at all is audible before the visitor's first interaction.
 */
export function isAudible(world: World, tier: AudioTier): boolean {
  if (!world.audio.interacted || world.audio.muted) return false;
  switch (tier) {
    case 'sfx':
      return true;
    case 'music':
      // The tier is the Room the visitor is in: a Room they have left is
      // silent, however its own Music Source was left standing.
      return isMusicSourceSwitchedOn(world.audio, world.rooms.current);
    case 'film':
      return world.audio.filmPlaying;
  }
}

/** Is the apartment allowed to make a sound at all? The header control's state. */
export function soundIsOn(world: World): boolean {
  return !world.audio.muted;
}

/**
 * Has this Room's Music Source been switched on?
 *
 * What the Music Source Prop paints as its own state, so it stays switched on
 * while the visitor is in another Room or has silenced everything.
 */
export function isMusicSourceOn(world: World, room: RoomId): boolean {
  return isMusicSourceSwitchedOn(world.audio, room);
}

/**
 * May this Room's music be heard right now?
 *
 * The per-Room form of the music tier, for the adapter holding one track per
 * Room: only the Room the visitor is in is ever allowed to play.
 */
export function isRoomMusicAudible(world: World, room: RoomId): boolean {
  // 20, §9: a Film rolling in this Room takes the Room Music with it. The
  // Cinema Room's music *is* the projector's clatter and the Bumper carries
  // its own bed of it, so the two would beat against each other; the Music
  // Source stays switched on underneath and comes back when the reel stops.
  if (isCurrentRoom(world, room) && world.audio.filmPlaying) return false;
  return isCurrentRoom(world, room) && isAudible(world, 'music');
}
// end 06

/** Is the apartment allowed to move? */
export function motionIsOn(world: World): boolean {
  return !world.motion.paused;
}

/**
 * Has the visitor turned motion on themselves?
 *
 * The one case in which a reduced-motion request from their system is set
 * aside. `motionIsOn` alone cannot separate a system that never asked from a
 * visitor who overruled it, and the stylesheet needs exactly that difference.
 */
export function motionIsOnByChoice(world: World): boolean {
  return world.motion.chosenByVisitor && !world.motion.paused;
}

/** Is this the Room the visitor is in? */
export function isCurrentRoom(world: World, room: RoomId): boolean {
  return world.rooms.current === room;
}

/**
 * Should this Room be on the page at all?
 *
 * True for the Room the visitor is in, and for the one they are leaving while
 * the transition runs — after which only the current Room is left standing.
 */
export function isRoomPainted(world: World, room: RoomId): boolean {
  return world.rooms.current === room || world.rooms.leaving === room;
}

// 17: cinema
/** The bookshelf the visitor's attention is on, for the Room to light up. */
export function attendedShelf(world: World): CinemaShelf | null {
  return world.cinema.attended;
}

// 18: cinema
/** Where the Room's errand has got to, for the Beat the DOM layer is playing. */
export function cinemaStep(world: World): CinemaStep {
  return world.cinema.step;
}

/**
 * The Posters on the wall, in the order he pinned them.
 *
 * One entry per filled slot, so the list grows from none to three as the pin
 * Beats finish and the board paints exactly what is up.
 */
export function pinnedPosters(world: World): readonly FilmId[] {
  return world.cinema.pinned;
}

/** The genre whose Posters are on the wall, or `null` while it is bare. */
export function openShelf(world: World): CinemaShelf | null {
  return openShelfOf(world.cinema);
}

/**
 * The bookshelf he has his arm in right now, or `null`.
 *
 * What makes the rummage visible on the shelf itself — the tubes rattling in
 * their cubbies — which matters because the Beat is otherwise 1.8 seconds of a
 * Boy standing still.
 */
export function rummagingShelf(world: World): CinemaShelf | null {
  return world.cinema.step === 'rummaging' ? world.cinema.errand : null;
}

// 19: cinema
/**
 * The Poster coming out of its frame, or already out of it.
 *
 * What the board paints as expanded — one at a time, and never a Poster that
 * is not on the wall.
 */
export function expandedPoster(world: World): FilmId | null {
  return expandedPosterOf(world.cinema);
}

/**
 * The Film whose details may be read right now, or `null`.
 *
 * Everything the details panel says, behind one question: it is `null` while a
 * Poster is still opening, so the panel cannot paint a word before the
 * expansion has finished, and it carries the Film itself — both titles, the
 * year, the pairing, the premise, the reason and the link — so the panel reads
 * the dictionary rather than being told what to say.
 */
export function posterDetails(world: World): Film | null {
  return readableFilmOf(world.cinema);
}

// 20: cinema — the projector, the reel in it, and what it is throwing.
/**
 * The Film whose reel is threaded, or `null` for an empty machine.
 *
 * The gate lever's whole state: with no reel it is the design note's `idle`
 * and says so, and with one it offers to roll — including long after the Film
 * has been stopped, because the reel stays on the spindle.
 */
export function loadedReel(world: World): FilmId | null {
  return loadedReelOf(world.cinema);
}

/**
 * The Film on the screen right now, or `null` for a dark one.
 *
 * Non-null from the first frame of the Bumper to the last of the slate, and it
 * carries the Film itself, so the title card reads both titles and the year
 * out of the same table the Poster did, and the genre it takes its title cue
 * from is the shelf the Film came off.
 */
export function rollingFilm(world: World): Film | null {
  return isCurrentRoom(world, 'cinema') ? rollingFilmOf(world.cinema) : null;
}

/**
 * Is the Cinema Room waiting on the clock?
 *
 * The one fact the page's frame loop cannot work out from the Cast: a Film
 * runs at its own length however the visitor feels about motion (§10.3), so
 * the loop that stops when the apartment holds still has to keep turning
 * while the Bumper and the title card play.
 */
export function cinemaNeedsClock(world: World): boolean {
  return isCurrentRoom(world, 'cinema') && cinemaAwaitsClock(world.cinema);
}

/**
 * Is there anything at all for the page's frame clock to do?
 *
 * The model's whole half of that question, in one answer, so the painter that
 * owns the frame loop asks once instead of reading three slices for itself.
 * What is left to the page is only what the browser alone can know: a tab in
 * the background, a stage scrolled off the screen.
 *
 * 07: the Cast's Cycles play while the Room the visitor is in has anyone in it
 * and the apartment is allowed to move. 14: an arrival still playing counts
 * even with nobody in the Room, because an empty hall is where it starts.
 * 20: and a Film on the Cinema Room's screen counts however still the visitor
 * asked the apartment to be.
 */
export function apartmentNeedsClock(world: World): boolean {
  if (cinemaNeedsClock(world)) return true;
  if (!motionIsOn(world)) return false;
  return actorsIn(world, world.rooms.current).length > 0 || arrivalView(world).state === 'playing';
}

/**
 * Is this Actor sitting in its beanbag in front of the screen?
 *
 * True of the Boy and the Girl while they are in the Cinema Room, standing
 * on their own seat and going nowhere — which is how the visitor finds them,
 * and what he goes back to when a shelf stops holding their attention.
 */
export function isSeated(world: World, actor: ActorId): boolean {
  const seat = seatOf(actor);
  if (!seat) return false;
  const view = findActorView(world.actors, actor);
  return !!view && view.room === 'cinema' && !view.moving && isOnMark(view.at, seat);
}

// 07: actors
/** Every Actor standing in this Room, as much as the DOM layer needs to paint. */
export function actorsIn(world: World, room: RoomId): readonly ActorView[] {
  return actorViewsIn(world.actors, room);
}

// 07: actors
/**
 * One Actor, or `null` if the apartment has not placed them yet.
 *
 * The Cast arrives Room by Room, so asking after a Cat before the Rooms they
 * roam exist is a fair question with a plain answer rather than a crash.
 */
export function actorView(world: World, actor: ActorId): ActorView | null {
  return findActorView(world.actors, actor);
}

// 08: the cats
/**
 * Meows the apartment has just made, to play once and then forget.
 *
 * Edge-triggered: the names are the ones the last tick or the last fuss
 * crossed, and the slice they live on changes identity as they appear and
 * again as they are forgotten, so a painter watching the slice plays each meow
 * exactly once without keeping a count of its own.
 */
export function catSfx(world: World): readonly string[] {
  return world.cats.sfx;
}

/** Is this cat being fussed over? What its petting Beat hangs on. */
export function isBeingPetted(world: World, cat: CatId): boolean {
  return isPetted(world.cats, cat);
}

// 16: the Activity Room
/** Which station's card is open, or `null`. One card serves all three. */
export function openActivity(world: World): ActivityId | null {
  return world.activities.open;
}

/** What the visitor has picked for tonight, or `null` while nothing is picked. */
export function chosenActivity(world: World): ActivityId | null {
  return world.activities.chosen;
}

// 45: the Game Room's three Portals
/**
 * The Portal the visitor is at, or `null` while the whole wall is at rest.
 *
 * What plays: the Scene inside this one runs and the other two hold their
 * still, which is the whole effect of looking *through* something.
 */
export function attendedPortal(world: World): PortalId | null {
  return world.portals.attended;
}

/** The Portal on the wall where it only has room for one. Never `null`. */
export function currentPortal(world: World): PortalId {
  return world.portals.current;
}

/**
 * The Portal expanded over the stage, or `null` while the wall is whole.
 *
 * 46: the expanded world plays whether or not anything is near the Portal
 * underneath, so the page asks this before it asks `attendedPortal`.
 */
export function openPortal(world: World): PortalId | null {
  return world.portals.open;
}

// 14: the Entryway. 09: the other four.
export type { BreakableId } from './cats';

/**
 * The world with one of the arrival's cues carried out.
 *
 * `motionOn` is false whenever the arrival is being finished rather than played,
 * and that one flag is the whole difference between watching the Cast come home
 * and finding them already there: `actors.ts` turns a walk with motion off into
 * the place the walk was going.
 */
function applyCue(world: World, cue: ArrivalCue, motionOn: boolean): World {
  switch (cue.kind) {
    case 'place':
      return { ...world, actors: placeActor(world.actors, cue.actor, ENTRYWAY, cue.mark, cue.facing) };
    case 'send':
      return { ...world, actors: sendActor(world.actors, cue.actor, cue.mark, 'walk', motionOn) };
    case 'sfx':
      // Sound is the DOM layer's to make; the model only says that it happened,
      // and `arrival.sfx` is where it says so.
      return world;
  }
}

function applyCues(world: World, cues: readonly ArrivalCue[], motionOn: boolean): World {
  let next = world;
  for (const cue of cues) next = applyCue(next, cue, motionOn);
  return next;
}

/**
 * The world with the arrival over, whatever it had left to do.
 *
 * Every remaining cue is carried out at once, with motion off, and anything
 * still walking takes its destination — which is exactly what the visitor would
 * have seen had they watched it through.
 */
function withArrivalOver(world: World): World {
  const finished = finishArrival(world.arrival);
  if (finished.arrival === world.arrival) return world;
  const settled = applyCues({ ...world, arrival: finished.arrival }, finished.cues, false);
  return { ...settled, actors: settleActors(settled.actors) };
}

/** What the DOM layer paints of the arrival: the Beats, the costumes, the SFX. */
export function arrivalView(world: World): ArrivalView {
  return viewArrival(world.arrival);
}

/** Which state each of the Entryway's Props is in right now. */
export function entrywayProps(world: World): EntrywayProps {
  return propsAt(world.arrival);
}

/** Is the Entryway's vase of dried grasses still on the hall table? */
export function vaseState(world: World): VaseState {
  return breakableState(world, 'entryway-vase');
}

/** Is this Breakable, anywhere in the apartment, still whole? */
export function breakableState(world: World, breakable: BreakableId): VaseState {
  return world.broken.has(breakable) ? 'broken' : 'intact';
}

/**
 * The world with this Breakable knocked over, if it was not already.
 *
 * `roamCats` reaches for this over the roll it decides on its own; the
 * `breakable-broken` event reaches for it from outside. Both leave the
 * apartment in the same state either way.
 */
function withBreakableBroken(world: World, breakable: BreakableId): World {
  if (world.broken.has(breakable)) return world;
  return { ...world, broken: new Set(world.broken).add(breakable) };
}

