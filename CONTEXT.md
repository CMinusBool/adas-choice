# Ada's choice

A personal, hand-made web page that recommends things to do together — co-op games, films,
and shared activities — presented as a small apartment the visitor walks through. It is a gift
for one recipient, not a product.

## Language

### The world

**Room**:
One navigable place in the apartment, reached by its own route. There are exactly four:
Entryway, Game Room, Cinema Room, Activity Room.
_Avoid_: page, screen, view, level

**Entryway**:
The Room the visitor arrives in, containing the front door the Cast enters through. It is the
apartment's hub, but it is a real place with furniture, not a menu overlaid on one.
_Avoid_: main menu, lobby, hub, home

**Stage**:
A Room's logical canvas: 1600 x 900 units, origin top-left, x right, y down, held by
`<div class="stage" data-stage="<room>">` and scaled to the Room's width in CSS. Walkable areas,
Props, doors and Actor positions are all written in stage units, so the same numbers mean the
same place at every screen width. Every Room has exactly one.
_Avoid_: canvas, viewport, board, pixels

**Scene**:
A per-game animated sprite loop on a Game Room card. Reserved to its existing meaning — a
Scene lives inside a Room and is never a synonym for one.
_Avoid_: using "scene" for a Room or for a Beat

**Prop**:
A fixed object in a Room that can be looked at or interacted with: a bookshelf, the projector,
the cabinet, a beanbag.
_Avoid_: object, item, thing

**Breakable**:
A Prop a Cat can knock down. Carries intact-or-broken state that persists for the visit.
_Avoid_: destructible

### The cast

**Cast**:
The five characters who inhabit the apartment: the Boy, the Girl, Míca, Mira and Luna. Their
appearance is fixed by the Character Sheet.

**Actor**:
A Cast member as the world model moves it: a position on a Room's Stage, a facing, and a Cycle
being played. The position is the Actor's feet — the bottom-centre of its sprite — and depth is a
y-sort against the Props around it. "Cast" is who they are; "Actor" is the moving thing the model
travels across a Stage and the DOM layer paints.
_Avoid_: sprite, entity, character (for the moving thing)

**Boy** / **Girl**:
The two people. The Boy is slim and taller, with a brown side-swept undercut and browline
glasses; the Girl is shorter and athletic, with a black ponytail. Established by the existing
artwork and binding on all new artwork.

**Míca**:
The calico cat — white underside, black and light-brown patching over back and head, and one
large irregular black mark beside her nose on her anatomical left. Adult, small, thin.

**Mira**:
The African wildcat-patterned cat — sandy-tawny base, dark mackerel striping, rufous ear backs,
ringed tail with a dark tip. Adult, small, thin.

**Luna**:
The black cat — solid black, short fine coat, a short tail about half the length of the other
two's, and green-yellow eyes where theirs are pale. Adult, the largest of the three and the
softest built, and the only cat who stands taller than 66 stage units to the shoulder: she is 72.
She is an Actor as of 2026-09-20 — `ActorId`, `.cycle` layers and validated placeholder frames —
and rides in the pet backpack with the other two. She roams, meows and can be petted like the
other two, and the Game Room's snow globe is her Breakable.

**Character Sheet**:
The frozen reference artwork and written description that fixes a Cast member's identity.
Every piece of generated artwork is drawn from the Character Sheet, never from another
piece of artwork.
_Avoid_: model sheet, style guide, reference

### Animation

**Cycle**:
A reusable looping animation for an Actor — walking, running, idling — whose position on
screen is driven by code rather than drawn into the frames. One Cycle serves every path an
Actor takes.
_Avoid_: loop, walk cycle (as a distinct term)

**Beat**:
A one-off scripted animation for a specific moment: searching a bookshelf, pinning a Poster,
being petted, knocking a Breakable down. Unlike a Cycle, a Beat is tied to the thing it
happens to.
_Avoid_: cutscene, animation, action

### The cinema

**Film**:
A real, existing film that the page recommends. Its title, year, premise and reason to watch
are factual; all artwork depicting it is original.

**Poster**:
Original artwork standing in for a Film, in the idiom of a film poster. Has a flat state on the
wall and an expanded state carrying the Film's details.
_Avoid_: card, thumbnail, cover

**Bumper**:
The original studio intro — logo animation and its own music — that plays on the projector
before a Film's title card. Invented for this page; it belongs to no real studio.
_Avoid_: intro, ident, logo

### The activities

**Activity**:
One of the three things the Activity Room proposes the two people do together over a video call.
Like a Film it is a recommendation with its own details — what it involves, what it needs, roughly
how long — and unlike a Film there is nothing to fetch or play: choosing one marks it as tonight's
and nothing else happens.
_Avoid_: game (a game is a Game Room card), idea, suggestion

### Sound

**Room Music**:
The music belonging to one Room, silent until the visitor clicks that Room's Music Source.
Distinct from SFX, which are audible by default.

**Music Source**:
The Prop that turns a Room's Room Music on and off — an object in the world rather than a
control in the interface.

**SFX**:
Short sounds tied to something happening: a meow, the projector's clatter, a Breakable
hitting the floor.

### Elsewhere

**Invitation**:
The message the visitor sends by choosing "I want to play this with u~", delivered by the
Cloudflare Worker. The page never handles the recipient address.
