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
    // Stopping early leaves chunks the search cannot match by meaning. The semantic
    // term is weighted 8, so an unembedded row scores up to 2.4 low and simply does
    // not surface — a silent quality loss, not a visible outage. Exiting 0 here told
    // a caller the corpus was fully embedded when it was not.
    if (r.remaining === -1) {
      console.error("  stopped on an error, see the log above");
      process.exitCode = 1;
      return;
    }
    if (r.embedded === 0) {
      console.error(`  no progress this pass, stopping — ${r.remaining} chunks still unembedded`);
      process.exitCode = 1;
      return;
    }
  }
  // Falling out of the loop means 60 passes did not finish the backlog. Without
  // this the script ended silently, with no output at all, on exit 0.
  console.error("  gave up after 60 passes with chunks still unembedded — re-run to continue");
  process.exitCode = 1;
}
void main();

export {};
