/**
 * A deployment swaps the hashed JS chunks on the CDN. A visitor who already has
 * the page open still holds the OLD manifest, so the next lazy import asks for
 * a file that no longer exists and the app breaks where it stands.
 *
 * Measured in production: 4 such failures across 3 sessions in a fortnight, on
 * `/` and `/survey`, each naming a different `?dpl=` deployment id — the
 * signature of a build having rolled underneath a live visitor.
 *
 * This matters because the error boundary's "Try again" calls React's `reset()`,
 * which re-renders the same tree and requests the same missing file. The button
 * that looks like recovery cannot recover. Only a reload fetches the current
 * manifest.
 */
const CHUNK_ERROR_PATTERNS = [
  /Failed to load chunk/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  // Safari and Firefox word the dynamic-import failure differently.
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && name === "ChunkLoadError") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

/**
 * Recover from an error boundary. A stale-deployment failure needs the page
 * reloaded; everything else is re-rendered in place, which is cheaper and keeps
 * the visitor's scroll position and state.
 */
export function recoverFromError(error: unknown, reset: () => void): void {
  if (isChunkLoadError(error) && typeof window !== "undefined") {
    window.location.reload();
    return;
  }
  reset();
}
