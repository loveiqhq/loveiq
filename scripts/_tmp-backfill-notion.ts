import { ingestNotion } from "@features/brain/server/ingest/notion";

async function main() {
  const budgetMs = Number(process.env.BUDGET_MS ?? 540_000);
  for (let pass = 1; pass <= 12; pass++) {
    const startedAt = Date.now();
    const res = await ingestNotion(new Date().toISOString(), () => Date.now() - startedAt > budgetMs);
    console.log(`PASS ${pass} ${JSON.stringify(res)} ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
    if (res.rows === 0) break;
  }
}
void main();
