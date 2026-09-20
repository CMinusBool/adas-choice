import { byId } from './painter';

/**
 * Give every Prop the surface it declares.
 *
 * A Prop is a box over a surface, and until ticket 53 a furnished Room named
 * that surface's file in `styles.css`, as `background-image: url("…")`. That
 * works, and it is invisible to everything this repository checks a URL with:
 * the loading gate in `src/dom/loading.ts` sweeps the page for `data-still`,
 * `data-animated` and `data-sheet`, and `scripts/assert-built-page.mjs` reads
 * the same attributes out of the built page. Ticket 35 furnished the Activity
 * Room with fourteen stylesheet URLs, and the apartment stopped waiting for its
 * artwork — the screen lifted onto a Room whose furniture had not loaded, and
 * nothing said so, because nothing was looking where the URL had gone.
 *
 * So a Prop's surface is declared where its box is, on the Prop:
 *
 *     <div class="prop a-backdrop" data-still="assets/activity-room/backdrop.png" …>
 *
 * and this turns it into the `--still` that `styles.css` paints with. The Scenes
 * in the Game Room have always worked this way — `src/dom/game-room.ts` builds
 * their `url("…")` from `data-sheet` at runtime — so this is that arrangement
 * offered to every Room, rather than a new one.
 *
 * What it buys is that there is still only one list: the markup. Declaring a
 * surface preloads it, gets it checked in `dist/`, and paints it, in one
 * attribute. The Rooms tickets 33, 34 and 36 furnish inherit all three by
 * writing that attribute, with nothing to add here or in `loading.ts`.
 *
 * Not a `Painter`, on purpose. A painter is handed the world and makes the page
 * look like it; a Prop's surface is the same file whatever the world is doing,
 * so this runs once from `src/main.ts` before the painters mount, the way
 * `readStoredLanguage` and `prefersReducedMotion` do.
 */
export function paintDeclaredArtwork(): void {
  const apartment = byId('apartment');
  // `:not(img)` because an `<img>` already paints itself from `src`, and its
  // `data-still` says something else entirely: the Scenes carry one as the
  // motionless poster their `<picture>` swaps in, which is the Game Room's
  // business rather than a background.
  for (const element of apartment.querySelectorAll<HTMLElement>('[data-still]:not(img)')) {
    const still = element.getAttribute('data-still');
    if (!still) continue;
    // Resolved against the document here rather than handed over relative, and
    // that is not a detail. A relative URL inside a custom property is resolved
    // where the `var()` is *substituted* — which is `styles.css`, and the built
    // stylesheet lands in `dist/assets/`, so `assets/activity-room/backdrop.png`
    // became `assets/assets/activity-room/backdrop.png` and 404'd. Worse, it
    // would resolve differently again under `npm run dev`, where the stylesheet
    // is served from the root. `document.baseURI` is the page's own address, so
    // the attribute stays relative — the site still runs from a repository
    // subpath — and what CSS receives can only mean one thing.
    element.style.setProperty('--still', `url("${new URL(still, document.baseURI).href}")`);
  }
}
