#!/usr/bin/env node
/**
 * The two Vercel Blob calls of the weekly database backup (.github/workflows/db-backup.yml).
 *
 *   upload <file> <pathname>   store an encrypted dump; never overwrites a copy
 *   prune <days>               delete the copies older than this many days
 *   check <runId>...           fail when the copy of any of these runs is missing
 *
 * Reads BLOB_READ_WRITE_TOKEN, the token of the private store `loveiq-db-backups`. The
 * workflow installs @vercel/blob next to this file, so the app does not depend on it.
 */
import { createReadStream, statSync } from "node:fs";

import { del, list, put } from "@vercel/blob";

const [command, ...args] = process.argv.slice(2);

/** Every copy in the store, across pages. */
async function copies() {
  const all = [];
  let cursor;
  do {
    const page = await list({ prefix: "db/", limit: 1000, cursor });
    all.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all;
}

if (command === "upload") {
  const [file, pathname] = args;
  const blob = await put(pathname, createReadStream(file), {
    access: "private",
    multipart: true,
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/octet-stream",
  });
  console.log(`Uploaded ${blob.pathname} (${statSync(file).size} bytes).`);
} else if (command === "prune") {
  const days = Number(args[0]);
  if (!(days > 0)) {
    console.error("prune needs a number of days greater than 0");
    process.exit(2);
  }
  const cutoff = Date.now() - days * 24 * 3_600_000;
  const old = (await copies()).filter((b) => new Date(b.uploadedAt).getTime() < cutoff);
  if (old.length > 0) await del(old.map((b) => b.url));
  console.log(`Deleted ${old.length} copies older than ${days} days.`);
} else if (command === "check") {
  // The token that uploads can also delete, so a copy that vanishes must be noticed: every
  // successful run of the workflow uploaded `db/<time>_run-<id>.pgdump.age`.
  const stored = (await copies()).map((b) => b.pathname);
  const missing = args.filter((id) => !stored.some((p) => p.includes(`_run-${id}.`)));
  console.log(`${stored.length} copies stored, ${args.length} expected.`);
  if (missing.length > 0) {
    console.error(`::error::Backups are missing from the store, runs ${missing.join(", ")}.`);
    process.exit(1);
  }
} else {
  console.error(
    "usage: db-backup-blob.mjs upload <file> <pathname> | prune <days> | check <runId>..."
  );
  process.exit(2);
}
