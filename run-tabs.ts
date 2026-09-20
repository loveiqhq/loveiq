import { sheetTabReading } from "@/app/api/cron/brain-reconcile/route";

async function main() {
  const r = await sheetTabReading(new Request("https://www.loveiq.org/api/cron/brain-reconcile"));
  if (!r) return console.log("returned NULL — the check could not run (lands in `unread`)");
  const gap = Math.abs(Number(r.left.value) - Number(r.right.value));
  console.log(`${gap > (r.tolerance ?? 0) ? "DISAGREES" : "AGREES"}  ${r.what}`);
  console.log(`   ${r.left.source} = ${r.left.value}`);
  console.log(`   ${r.right.source} = ${r.right.value}   (tolerance ${r.tolerance})`);
}
main();
