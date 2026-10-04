/**
 * Prints how many high or critical advisories in an `npm audit --json` report
 * (stdin) are not accepted in `.osv-scanner.toml`, or "unknown" when the report
 * is unreadable. `security.yml` fails on a number above 0 and only warns on
 * "unknown". The counting lives in ./lib/npm-audit-gate.mjs.
 *
 *   npm audit --audit-level=high --json | node scripts/npm-audit-gate.mjs
 *
 * A missing or unreadable `.osv-scanner.toml` throws, which fails the step:
 * no list of exceptions must never read as "everything is accepted".
 */
import { readFileSync } from "node:fs";

import { acceptedAdvisories, unacceptedAdvisories } from "./lib/npm-audit-gate.mjs";

const result = unacceptedAdvisories(
  readFileSync(0, "utf8"),
  acceptedAdvisories(readFileSync(".osv-scanner.toml", "utf8"))
);

for (const id of result.accepted) {
  console.error(`accepted in .osv-scanner.toml, not counted: ${id}`);
}
for (const id of result.expired) {
  console.error(`acceptance in .osv-scanner.toml has EXPIRED, counted again: ${id}`);
}
console.log(result.count);
