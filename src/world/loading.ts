/**
 * What the apartment is still waiting for before it lets the visitor in.
 *
 * The wait is deliberate: a Cat should never walk into a Room ahead of its own
 * artwork. The model holds only the count, so progress can only ever move
 * because something really finished — there is no clock in here to fake it with.
 */
/** How one asset finished: either it arrived, or it never will. */
export type AssetOutcome = 'loaded' | 'failed';

export interface LoadingSlice {
  /**
   * Every asset URL the page has declared, or `null` before it has declared
   * any. The two are different states: an apartment that has not yet been told
   * what it is waiting for is not ready, while one told there is nothing to
   * wait for is ready immediately.
   */
  readonly declared: readonly string[] | null;
  /** The declared URLs that have settled — loaded or failed. */
  readonly settled: readonly string[];
  /** The declared URLs that failed. A failure settles; it never blocks. */
  readonly failed: readonly string[];
}

/** The apartment before the page has said what there is to load. */
export function createLoading(): LoadingSlice {
  return { declared: null, settled: [], failed: [] };
}

/**
 * The apartment once the page has listed what it is waiting for.
 *
 * Declared once, on arrival. The same slice comes back for a later declaration,
 * because a list arriving after the door has opened would shut it again — and
 * duplicates are collapsed, since a picture two Rooms share is one wait, and a
 * list counting it twice would leave the visitor waiting for something that has
 * already arrived.
 */
export function declareAssets(loading: LoadingSlice, urls: readonly string[]): LoadingSlice {
  if (loading.declared !== null) return loading;
  return { ...loading, declared: [...new Set(urls)] };
}

/**
 * The apartment once one declared asset has arrived, or been given up on.
 *
 * The same slice comes back for anything that cannot move the count: a URL
 * nobody declared, one already settled, or one reported before the page said
 * what it was loading. The page is free to report twice; the count stays true.
 */
export function settleAsset(loading: LoadingSlice, url: string, outcome: AssetOutcome): LoadingSlice {
  if (loading.declared === null || !loading.declared.includes(url)) return loading;
  if (loading.settled.includes(url)) return loading;
  return {
    ...loading,
    settled: [...loading.settled, url],
    // A failure is a settlement: the apartment stops waiting for it and says so,
    // rather than holding the visitor at the door over one missing file.
    failed: outcome === 'failed' ? [...loading.failed, url] : loading.failed,
  };
}

/** Is everything the apartment declared accounted for? */
export function everythingSettled(loading: LoadingSlice): boolean {
  return loading.declared !== null && loading.settled.length >= loading.declared.length;
}

/** How far the load has got, from 0 to 1. */
export function progressOf(loading: LoadingSlice): number {
  if (loading.declared === null) return 0;
  if (loading.declared.length === 0) return 1;
  return loading.settled.length / loading.declared.length;
}
