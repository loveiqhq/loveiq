/**
 * The same-URL history entry that lets the back button close an open overlay,
 * on browsers without CloseWatcher (Safari). See
 * features/report/ui/hooks/useCloseOnBack.ts for why that entry exists at all.
 *
 * ONE entry for whatever overlays are open, owned here rather than by each
 * overlay, because overlays hand off to each other in a single tap. "Share
 * report" in the chapter drawer closes the drawer and opens the share modal in
 * the same handler. With an entry per overlay, the drawer's asynchronous
 * `history.back()` would land AFTER the share modal pushed its own entry, take
 * that one off instead, and close the modal the reader had just opened
 * (e2e/paywall-back.spec.ts pins it: per-overlay entries fail there). Here the
 * drawer's release is deferred to a microtask, the share modal acquires in the
 * same commit, and the one entry simply changes hands.
 *
 * The one popstate listener also tells our own `history.back()` apart from the
 * reader's back press, so tidying up never closes anything.
 *
 * Nothing else writes OVERLAY_ENTRY_KEY, which is what lets the pieces that
 * must step around the entry recognise it: the Stripe hand-off replaces it, and
 * a chapter link takes it off before it navigates.
 */
export const OVERLAY_ENTRY_KEY = "__loveiqOverlay";

interface Owner {
  close: () => void;
}

/** Overlays holding the entry, innermost last. */
const owners: Owner[] = [];
/** Our entry is the one on top. */
let entryOnTop = false;
/** We called history.back() and the traversal has not landed yet. */
let popping = false;
/** Run once our own traversal lands: a navigation waiting for the entry to go. */
let afterPop: Array<() => void> = [];
let listening = false;

function push() {
  window.history.pushState({ [OVERLAY_ENTRY_KEY]: true }, "");
  entryOnTop = true;
}

function pop() {
  popping = true;
  window.history.back();
}

function onPopState() {
  if (popping) {
    // Our own history.back() landing, not the reader.
    popping = false;
    entryOnTop = false;
    const queued = afterPop;
    afterPop = [];
    for (const run of queued) run();
    // An overlay acquired while the traversal was in flight: it needs an entry.
    if (owners.length > 0 && !entryOnTop) push();
    return;
  }
  if (!entryOnTop || window.history.state?.[OVERLAY_ENTRY_KEY]) return;
  // The reader pressed back: the entry is gone. Close the innermost overlay.
  //
  // Deliberately NOT re-pushed for any overlay still open behind it. The close
  // lands a render later, so at that moment the closing overlay still looks
  // open too, and a re-push followed by its release popped an entry the reader
  // never saw — recorded while the page was scroll-locked, so Safari restored
  // scroll 0 and threw them to the top. No two overlays here are ever open at
  // once; a hand-off between them is sequential and handled at release.
  entryOnTop = false;
  owners[owners.length - 1]?.close();
}

/**
 * Hold the entry while an overlay is open. Returns the release, which must run
 * when it closes — a React effect cleanup is exactly that.
 */
export function acquireOverlayEntry(close: () => void): () => void {
  if (!listening) {
    window.addEventListener("popstate", onPopState);
    listening = true;
  }
  const owner: Owner = { close };
  owners.push(owner);
  if (!entryOnTop && !popping) push();
  return () => {
    const at = owners.indexOf(owner);
    if (at !== -1) owners.splice(at, 1);
    // Deferred, so an overlay opening in the same commit can take the entry over.
    queueMicrotask(() => {
      if (owners.length > 0 || !entryOnTop || popping) return;
      // Only while it is still on top. After a navigation the top entry belongs
      // to the new page, and going back from there would undo the navigation.
      if (window.history.state?.[OVERLAY_ENTRY_KEY]) pop();
      else entryOnTop = false;
    });
  };
}

/**
 * Whether the entry on top is ours: a duplicate of the page beneath it.
 * False wherever CloseWatcher is used, because no entry is ever pushed there.
 */
export function isOnOverlayEntry(): boolean {
  return typeof window !== "undefined" && Boolean(window.history.state?.[OVERLAY_ENTRY_KEY]);
}

/**
 * Run `navigate` once our entry is off the stack, so the navigation takes its
 * place instead of stacking on top of it. Runs immediately when there is no
 * entry to remove. A chapter link uses this: on Safari the drawer's entry is on
 * top when it is tapped, and a fragment navigation pushed over it left a dead
 * back press behind — or, racing the drawer's own release, undid the jump.
 */
export function afterOverlayEntryGone(navigate: () => void): void {
  if (!isOnOverlayEntry()) {
    navigate();
    return;
  }
  afterPop.push(navigate);
  if (!popping) pop();
}

/** Test-only reset: module state outlives a jsdom test. */
export function __resetOverlayHistoryForTests(): void {
  owners.length = 0;
  entryOnTop = false;
  popping = false;
  afterPop = [];
  if (listening && typeof window !== "undefined") {
    window.removeEventListener("popstate", onPopState);
  }
  listening = false;
}
