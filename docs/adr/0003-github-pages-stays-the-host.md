# GitHub Pages stays the host

The page is served as static files from GitHub Pages, and the only dynamic behaviour — the
Invitation — is handled by a Cloudflare Worker that is deployed separately. The obvious future
question is why the page does not simply move to Cloudflare Pages and sit beside its own Worker.
It was considered and rejected: consolidating the two would buy faster delivery, rewrite rules for
clean URLs instead of hash routes, and headroom for traffic, and none of those are things this
page needs.

## The rule for revisiting this

The page's owner set the criterion explicitly: move only if a different host makes the page
**better**. Serving more people and loading faster do not qualify on their own. This page is a
gift with an audience of one, and a loading indicator on arrival was accepted precisely so that
delivery speed would stop being a design constraint.

If some future feature genuinely cannot be built on static hosting, that is a reason to move.
Performance and scale are not.

## Consequences

- Routing stays hash-based, as recorded in ADR 0001. Cloudflare Pages would allow real paths;
  GitHub Pages has no rewrite rules, so a direct visit to one would 404.
- The Worker keeps its own deployment, its own secrets and its own tests. The split between a
  static page and a separate Worker is deliberate, not an accident of history.
- Artwork is committed to the repository and served from it, so repository weight is the practical
  limit to watch rather than bandwidth. Git keeps every version of every binary, so assets should
  be committed once settled rather than iterated in-tree.
