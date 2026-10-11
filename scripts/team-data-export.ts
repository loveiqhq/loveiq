/**
 * The team's copy of the production data, from a laptop: every customer and product table,
 * one CSV each, into a folder here and, with --drive-folder, into the team's Drive folder.
 * What goes in and why is in features/admin/server/team-export.ts. The usual way is to ask
 * Claude (Jarvis's `export_all_data`), which runs the same export on the server.
 *
 * Usage, from the repository root:
 *   npx tsx --env-file=.env.local scripts/team-data-export.ts --out <folder outside any git repo>
 *     [--drive-folder <Google Drive folder id>]
 * With --drive-folder each CSV replaces the file of the same name in that folder, uploaded as
 * ec@ through domain-wide delegation, so the folder's link and sharing stay as they are.
 * See docs/runbooks/TEAM_DATA_EXPORT.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  buildExport,
  checkFolder,
  tableSpecs,
  uploadExport,
} from "@features/admin/server/team-export";
import { DRIVE_WRITE_SCOPE, getDelegatedToken } from "@shared/http/google-oauth";

/**
 * Customer data must never land where `git add` can reach it: not in this repository, and
 * not in any other checkout either (a worktree's export pointed at the main checkout would
 * pass a check against this repository alone).
 */
export function assertOutsideRepo(dir: string, repoRoot = resolve(__dirname, "..")): void {
  const target = resolve(dir);
  const rel = relative(repoRoot, target);
  let inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!inside) {
    let probe = target;
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    const git = spawnSync("git", ["-C", probe, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    inside = git.stdout?.trim() === "true";
  }
  if (inside) {
    throw new Error(
      `refusing to write inside a git repository (${dir}): this is customer data and must never be committed`
    );
  }
}

async function main(): Promise<void> {
  const arg = (flag: string) => {
    const at = process.argv.indexOf(flag);
    if (at === -1) return undefined;
    const value = process.argv[at + 1];
    // An unset shell variable leaves the flag with nothing after it: say so, never skip it.
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    return value;
  };
  const out = arg("--out");
  if (!out) throw new Error("--out <folder outside any git repository> is required");
  assertOutsideRepo(out);
  const folder = arg("--drive-folder");
  const driveToken = async () => {
    const token = await getDelegatedToken("ec@loveiq.org", DRIVE_WRITE_SCOPE);
    if (!token) {
      throw new Error("no Drive token: needs GOOGLE_IMPERSONATE_SERVICE_ACCOUNT and gcloud ADC");
    }
    return token;
  };
  // Before the long read, so a missing Google login or a folder others can open fails in a
  // second, not after minutes.
  if (folder) await checkFolder(await driveToken(), folder);

  console.log("reading every table (about a minute)");
  const files = await buildExport(await tableSpecs());
  mkdirSync(out, { recursive: true, mode: 0o700 });
  for (const f of files) writeFileSync(join(out, f.name), f.body, { mode: 0o600 });
  console.log(`wrote ${files.length} files to ${out}`);

  if (folder) {
    // A fresh token: one lasts an hour, and the read before this can be long.
    const token = await driveToken();
    await checkFolder(token, folder);
    await uploadExport(token, folder, files);
    console.log(`uploaded ${files.length} files to Drive folder ${folder}`);
  }
}

if (process.argv[1]?.endsWith("team-data-export.ts")) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
