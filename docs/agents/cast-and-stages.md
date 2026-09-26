# The Cast, the stage and furnishing a Room

How Actors arrive and are placed, what a stage is, and how a Room is furnished.
Read this in full when touching `src/world/actors.ts`, `src/world/arrival.ts`,
`src/dom/arrival.ts`, `src/dom/actors.ts`, `src/dom/artwork.ts`, any Room's stage
markup or Prop CSS, or when furnishing or placing anything in a Room.

## Arrival, stages and Props

- **The Cast is wherever the visitor is, and it arrives.** The Boy, the Girl and all three cats are
  in whichever Room is open, placed by `HOMES` in `src/world/actors.ts`. A Room is not found already
  settled: it plays an **Arrival** of about three seconds on every entry — the Girl opens the Door
  and holds it, the cats run through first, the Boy comes last, everyone walks to their mark — and
  any click, tap or key press ends it and settles everyone at once. **Not found settled for a
  moment either**: a Room the page opens on has its marks taken down and its floor cleared as the
  Arrival is *made*, not as it starts, so the wait behind the loading screen is a wait on an empty
  Room rather than on a Cast about to blink out (ticket 51). The Entryway does the same with its own
Arrival: while it waits, its hall is empty and its props are in their pre-entry state — door shut,
coats worn, backpack carried — cleared when the world is created, not when the Arrival starts
(ticket 59). For the same reason input ends only an
  Arrival that is **playing** — the page reports a tap on the loading screen like any other, and
  ending a waiting Arrival there would lift the screen onto a Room whose Door never opened. A stage
  nobody can see and a request for stillness do still call off a waiting one, and both put everybody
  on their mark, because a waiting Arrival has already emptied its Room. With motion off nothing plays
  and the Room is found at rest, which is `createRoomArrival(room, over: true)` and needs no second
  code path. **Three seconds is fixed and the Rooms are not the same size**, so `cycleWithin` in
  `src/world/actors.ts` decides per Actor: a mark a walk reaches inside the script is walked to, and
  one further off than the script is long is hurried to at a run. Move a Room's marks and its Cast
  changes gait rather than the Arrival changing length. The script does not place anybody at its
  end — a last stride finishes under its own steam, which is why the last one lands at 3.28 s in the
  Game Room, 2.80 in the Activity Room (ticket 96; 3.44 on its old stage) and 3.60 in the Cinema Room — but being **cut short** does
  place everybody, on the marks the Arrival took down when the Door opened.
  The Entryway's own 11.9s arrival is a different thing and is unchanged: it is the Cast coming in
  from outside, played once. The Doors are live all the way through it, so a Door taken at five
  seconds finishes it **in the Entryway, before the Cast is gathered into the Room being walked
  into** — finishing it afterwards put all five of them back in the hall they had just left and
  handed the new Room a set of marks nobody was standing on, which is a Room with no Cast in it
  (ticket 51). Because a Door has to open, **a door leaf is a separate transparent two-cell asset
  (shut, open) and every Room backdrop is drawn with an empty doorway**; `src/dom/arrival.ts` swings
  the leaf through `data-door`, so an art drop replaces a surface and keeps the behaviour.
- **Every Room has its own stage**: a 16:9 logical canvas, origin top-left, x right, y down, whose
  size is its entry in `STAGES` (`src/world/stage.ts`), held by
  `<div class="stage" data-stage="<room>">` and scaled to the Room's width in CSS. A Room's size is
  set in four places in one commit — its `STAGES` entry, its `.stage[data-stage=…]` line in
  `styles.css`, its backdrop Prop's `--w/--h` in `index.html`, and `"stage"` in its backdrop
  manifest — and `scripts/check-stages.test.mjs` names any left behind. Walkable areas, Props, doors
  and Actor positions are written in that Room's units, so the same numbers mean the same place at
  every screen width. An Actor's position is its feet — the bottom-centre of its sprite — and depth
  is a y-sort. Furnish a Room in stage units; never in pixels.
- **The one door.** The Boy stands 300 units (180 cm, so 1 cm = 1.667 units) and **every door in the
  apartment is 142 × 350 units** — the Entryway's front door, its three Room doors and each Room's
  way back, the box on the stage and the doorway painted behind it, within ±3%. A Room's backdrop is
  scaled whole so its painted doorway meets that size, and the Room's stage takes the size that
  scale gives it (design 75 §2). Everything else keeps the proportions it was drawn with: a drop
  scales it about its bottom-centre to the factor its design note gives, records the factor in the
  Room's manifest, and lists in `docs/known_issues.md` anything that ends more than 10% from its
  real-world size.
- **Furnishing a Room.** A Prop is a box in stage units — `--x/--y/--w/--h`, turned into
  percentages of the stage by `left: calc(var(--x) / 16 * 1%)` and its three siblings — over a CSS
  placeholder surface, so dropping artwork in swaps the surface and keeps the box. A Prop drawn
  smaller than its design note's size carries a fifth, `--scale` (ticket 63: the Cinema Room's
  shelves at .7 and its board at .85): its box is still the scaled one in stage units, and inside
  it `--note-u` is the note's unit at that scale, so every number written inside the Prop stays the
  note's. `--u` is the stage unit everywhere, those Props included (ticket 70). **An art drop
  swaps that surface by putting the file on the Prop's `data-still`, never by writing a `url()` into
  `styles.css`** — the attribute is what preloads it and what gets it checked in `dist/`.
  `src/dom/artwork.ts` turns `data-still` into a `--still` custom property and one zero-specificity
  `:where([data-still]:not(img))` rule paints it, resolving against `document.baseURI` because a
  relative `url()` in a custom property resolves where the `var()` is **substituted**, not where it
  is declared. Its `--z` is its
  sort key, and it has to be one, because `src/dom/actors.ts` gives every Actor
  `z-index: round(y)` and the two interleave so an Actor can pass behind a shelf; a stage is
  `isolation: isolate` to keep those keys local to their Room. A stage that holds a control — a
  door link, a Music Source button — cannot itself be `aria-hidden` or `pointer-events: none`;
  those move to its decorative children. And the Cast is declared per Room in one table, `HOMES`
  in `src/world/actors.ts`, placed by `gatherInto(slice, room)`: a Room says who is in it rather
  than writing placement code.
  **The four Rooms still name their Props four ways** — `.entryway-stage .at`,
  `#room-games .stage [data-box]`, `.stage-cinema .cinema-prop` and
  `.stage[data-stage="activities"] .prop` — but since ticket 50 the **arithmetic is written
  once**, in a four-part selector list, and each Room's own rule keeps only what it really
  differs on: the Entryway and the Activity Room sort on `--z`, the Cinema Room sorts every Prop
  at a flat 640, the Game Room writes each key inline. A selector list gives each part its own
  specificity, so folding them changed no cascade — checked by comparing the computed
  `position`/`left`/`top`/`width`/`height`/`z-index` of all 480 Prop boxes across four Rooms and
  four widths before and after. Renaming the four hooks to one is a separate, markup-wide job and
  is still not worth doing on its own.
  **What is not shared is `pointer-events`, and it is load bearing.** A stage that holds no
  control keeps the global `pointer-events: none` and lets its handful of real controls take
  theirs back — the Cinema Room and the Entryway. A stage that turns `pointer-events: auto` back
  on for the Room as a whole **must** then put it back to `none` for everything `aria-hidden`,
  or the Cast blocks clicks on whatever it is standing in front of. `#room-games .stage` has had
  that guard since ticket 45; the Activity Room went without one until ticket 50, where the Boy
  was found intercepting every click on the hunt station he stands over. Cats are never
  `aria-hidden` — a cat is a real button with a name — so the guard never costs a petting.
  **One floor is shared (ticket 103):** on every stage, an Actor's `.cycle` layer and anything
  `aria-hidden`, `role="img"` or `aria-disabled="true"` takes no pointer, `!important`, next to
  `.actor > .cycle` in `styles.css`. So nothing but a control can lie over a cat's pad, whatever
  a Room turns back on. A new Prop that takes no input needs one of those three attributes, not a
  rule of its own; `scripts/verify/controls.mjs --only cats,pointers` fails on one that has none.
