/**
 * The world model: the one place in the codebase where a decision lives.
 *
 * Pure TypeScript with no DOM and no browser APIs — time and preferences enter
 * as parameters, never by asking the browser. `tsconfig.world.json` covers this
 * directory with no DOM library at all, so a stray `document` fails the build.
 * The DOM layer imports only from here.
 */
export type { Language } from './language';
export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, resolveLanguage, toggleLanguage } from './language';

export type { RoomId } from './rooms';
export { ENTRYWAY, ROOM_IDS, isCanonicalHash, parseRoute, roomHash } from './rooms';

export type { MotionSlice } from './motion';

// 05: loading
export type { AssetOutcome, LoadingSlice } from './loading';

export type { RoomsSlice, TransitionKind, World, WorldEvent, WorldInputs } from './world';
export { advance, createWorld, isCurrentRoom, isRoomPainted, motionIsOn, motionIsOnByChoice } from './world';
// 05: loading
export { isInteractive, loadingProgress } from './world';

// 06: audio
export type { AudioSlice, AudioTier } from './audio';
export { anySoundShips } from './audio';
export { isAudible, isMusicSourceOn, isRoomMusicAudible, soundIsOn } from './world';
// end 06

// 07: actors — the Cast, where it is, and the floor it is allowed to stand on.
export type { Point, Polygon, StageSize } from './stage';
export { STAGES } from './stage';
export type { ActorId, ActorView, ActorsSlice, CycleId, Facing, RandomSource } from './actors';
export { ACTOR_IDS, isWalkable, seededRandom } from './actors';
export { actorView, actorsIn } from './world';

// 17: the Cinema Room — its marks, its shelves, and who is sitting down.
export type { CinemaShelf, CinemaSlice, PosterSlot } from './cinema';
export { CINEMA_MARKS, CINEMA_SHELVES, posterSlot } from './cinema';
export { attendedShelf, isSeated } from './world';
// 16: the Activity Room — its three stations, and tonight's pick.
export type { ActivitiesSlice, ActivityId } from './activities';
export { ACTIVITY_IDS } from './activities';
export { chosenActivity, openActivity } from './world';
// 45: the Game Room's three Portals — the one the visitor is at, and the one
// a narrow wall has room for.
export type { PortalId, PortalsSlice } from './portals';
export { PORTAL_IDS } from './portals';
export { attendedPortal, currentPortal } from './world';
// 46: and which one is expanded over the stage.
export { openPortal } from './world';
// 47: and whether a drag across a narrow wall is a swipe, and which way.
export { swipeStep } from './portals';
// 14: the Entryway — the Room's geometry, its Props and its arrival.
export type { EntrywayPropId, EntrywayProps, VaseState } from './entryway';
export { ENTRYWAY_MARKS, ENTRYWAY_WALKABLE } from './entryway';
export type { ArrivalSlice, ArrivalState, ArrivalView, BeatId, Box, Costume, PlayingBeat } from './arrival';
export { ARRIVAL_SECONDS, DOORSTEP_MS } from './arrival';
// 44: every other Room's own short entrance, on the same clock and walked to
// the same marks. A Door's leaf has four states; the painter asks for one.
export type { DoorState, RoomArrivalSlice } from './arrival';
export { ROOM_ARRIVAL_SECONDS } from './arrival';
export { roomArrivalSfx, roomArrivalState, roomDoorState } from './world';
export type { BreakableId } from './world';
export { arrivalView, breakableState, entrywayProps, vaseState } from './world';

// 08: the three cats — who they are, and where a Room lets them stand.
export type { CatId, CatsSlice } from './cats';
export { CAT_CLEARANCE, CAT_IDS, CAT_MARKS, isCat, meowOf, pettingBeat } from './cats';
export { catSfx, isBeingPetted, knockingDown } from './world';

// 09: the apartment's five Breakables — who owns each one, where she knocks
// it down, how long that takes and what it sounds like going over, all on one
// record apiece.
export type { Breakable } from './cats';
export { BREAKABLE_IDS, breakableById, knockBeat } from './cats';
// 68: the two rolls — whether it falls this visit, and where in the minute.
export { FALL_WINDOW_MS, LATE_CAT_MS } from './cats';

// 18: the nine Films, and the rummage that pins three of them to the wall.
// 19: `FilmPairing` is what the panel's meta line turns into a copy key.
export type { Film, FilmId, FilmPairing } from './films';
export { filmById, filmsOn } from './films';
export type { CinemaStep } from './cinema';
export { capsGoneShelf, cinemaStep, openShelf, pinnedPosters, rummagingShelf } from './world';

// 19: the Poster expansion, and the Film whose details it opens onto.
export { expandedPoster, posterDetails } from './world';

// 20: the reel he fetches for a chosen Film, and the projector that rolls it.
// `REEL_STEPS` is the order the sequence runs in and the one rule about it:
// forwards, one step at a time, and never back the way it came.
export { REEL_STEPS } from './cinema';
export { cinemaNeedsClock, loadedReel, rollingFilm } from './world';

// 40: the one question the page's frame loop asks the model, in place of the
// three slices the Actors painter used to read for itself.
export { apartmentNeedsClock } from './world';
