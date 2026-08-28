import { ingestNotion } from "@features/brain/server/ingest/notion";
async function main() {
  const budget = Number(process.env.BUDGET_MS ?? 540_000);
  const t0 = Date.now();
  const res = await ingestNotion(new Date().toISOString(), () => Date.now() - t0 > budget);
  console.log(`PASS ${JSON.stringify(res)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
void main();
