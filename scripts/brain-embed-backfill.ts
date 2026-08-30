/**
 * Backfill embeddings for every chunk that has none.
 *
 * Restartable: it selects on `embedding IS NULL`, so interrupting it loses only
 * the batch in flight. Safe to run while ingesters are writing.
 */
async function main() {
  const { embedMissing } = await import("@features/brain/server/embed");
  const started = Date.now();
  for (let pass = 1; pass <= 60; pass++) {
    const t0 = Date.now();
    const r = await embedMissing(() => Date.now() - t0 > 540_000, 50);
    console.log(
      `  pass ${pass}: embedded ${r.embedded}, ${r.remaining} left ` +
        `(${Math.round((Date.now() - t0) / 1000)}s, total ${Math.round((Date.now() - started) / 60000)}m)`
    );
    if (r.complete) return console.log("  done — every chunk has an embedding");
    if (r.remaining === -1) return console.log("  stopped on an error, see the log above");
    if (r.embedded === 0) return console.log("  no progress this pass, stopping");
  }
}
void main();

export {};
