/** Every console error/warning on the landing page, verbatim, no filtering. */
import { chromium, devices } from "playwright";
const O = process.env.ORIGIN ?? "https://www.loveiq.org";
const URL_ = process.env.URL_ ?? `${O}/?utm_source=google&utm_medium=cpc&utm_campaign=probe`;
const b = await chromium.launch();
const c = await b.newContext({ ...devices["Pixel 7"], locale: "en-US" });
const p = await c.newPage();
const msgs = [];
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") msgs.push([m.type(), m.text()]);
});
p.on("pageerror", (e) => msgs.push(["pageerror", String(e.message)]));
p.on("requestfailed", (r) =>
  msgs.push(["reqfail", `${r.url().slice(0, 110)} ${r.failure()?.errorText}`])
);
await p.goto(URL_, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(9000);
await p.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    window.scrollBy(0, innerHeight);
    await new Promise((r) => setTimeout(r, 200));
  }
});
await p.waitForTimeout(4000);
console.log(`console/page issues on ${URL_.slice(0, 60)}: ${msgs.length}`);
for (const [t, m] of msgs) console.log(`  [${t}] ${m.slice(0, 200)}`);
await c.close();
await b.close();
