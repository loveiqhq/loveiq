import { buildReadings } from "@/app/api/cron/brain-reconcile/route";
import { reconcile } from "@features/brain/server/reconcile";

async function main() {
  const { readings, unread } = await buildReadings();
  console.log(`readings: ${readings.length}   unread: ${JSON.stringify(unread)}\n`);
  for (const r of readings) {
    const gap = Math.abs(Number(r.left.value) - Number(r.right.value));
    const bad = gap > (r.tolerance ?? 0);
    console.log(`${bad ? "DISAGREES" : "   ok    "}  ${r.what}`);
    console.log(`            ${r.left.source} = ${r.left.value}`);
    console.log(`            ${r.right.source} = ${r.right.value}   (tolerance ${r.tolerance})`);
  }
  console.log("\n--- reconcile() says ---");
  for (const d of reconcile(readings)) console.log(JSON.stringify(d));
}
main();
