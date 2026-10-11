/**
 * What changed in a Figma design since a date, in one call: `design_changes`.
 *
 * WHY. Counted 2026-10-11 over 60 days: 1,272 of 4,011 real Jarvis calls went to Figma, 890
 * of them node-by-node reads, and one session comparing two versions on 2026-09-29 made 291
 * calls in 47 minutes and drew seven 429s in one minute. Figma's allowance is the whole
 * team's, so everyone else's reads failed with it. A comparison needs the version list and
 * the design at two versions, nothing more.
 *
 * NOT THE WHOLE FILE AT FULL DEPTH, because it does not fit. Measured 2026-10-11: the Report
 * 3.0 file is 74 MB of JSON and took 62 s to read once, and the route has 60 s for
 * everything. Its Paygate page alone is 27 MB in 16 s. So text is compared inside one page or
 * frame, read whole at both versions, and a whole file is compared FILE_DEPTH levels down:
 * 0.7 MB a version for Report 3.0, 8.9 MB for the main LoveIQ file.
 *
 * Only names, layers and text are compared. Colours, positions, sizes and images are not,
 * and every answer says so.
 */
import { Redis } from "@upstash/redis";
import logger from "@shared/observability/logger";
import { api, figmaFetch, figmaLimitText, nodeLink, noSuchNode } from "./figma";

/** Figma's largest page of versions. */
const VERSIONS_PAGE = 50;
/** 300 versions. Fifty covered the eleven busiest days of the Report 3.0 file. */
const MAX_VERSION_PAGES = 6;
/** For a whole file: 1 is its pages, 2 what is on them, 3 what is inside their sections. */
export const FILE_DEPTH = 3;
/** The route has 60 s; the rest is for answering. */
const BUDGET_MS = 50_000;
/** One version's read; a later read gets only what is left of the budget. */
export const READ_TIMEOUT_MS = 40_000;
const VERSIONS_TIMEOUT_MS = 10_000;
/**
 * Bytes of one version's JSON. Paygate, the largest page measured, is 27 MB; the whole Report
 * 3.0 document is 74 MB and is refused, as is anything else this big, before it is all held.
 */
export const MAX_READ_BYTES = 40_000_000;
/** Two saved versions never change, so a day is only about how long the cache holds it. */
const CACHE_SECONDS = 86_400;
/** Change lines in one answer, and per frame or page, before it says how many more. */
const MAX_LINES = 120;
const MAX_LINES_PER_FRAME = 8;
const MAX_TOP_LINES = 20;
const MAX_VERSION_LINES = 15;

export interface DesignNode {
  id: string;
  name?: string;
  type?: string;
  characters?: string;
  children?: DesignNode[];
}

interface Version {
  id: string;
  created_at: string;
  label?: string | null;
  description?: string | null;
  user?: { handle?: string } | null;
}

/**
 * Why a read failed, when it is not Figma's own status: `timeout` after `waitedMs`, `too big`
 * past MAX_READ_BYTES, or `no time` when the budget was spent before the read could start.
 */
type Failure = {
  ok: false;
  status: number;
  headers?: Headers;
  why?: "timeout" | "too big" | "no time";
  waitedMs?: number;
};

/** The layers worth naming. Shapes, vectors and images are counted, not listed. */
const SHOWN = new Set([
  "CANVAS",
  "SECTION",
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "TEXT",
]);
const WORD: Record<string, string> = {
  CANVAS: "page",
  SECTION: "section",
  FRAME: "frame",
  GROUP: "group",
  COMPONENT: "component",
  COMPONENT_SET: "component set",
  INSTANCE: "instance",
  TEXT: "text",
};
const word = (type?: string) => WORD[type ?? ""] ?? (type ?? "layer").toLowerCase();

let _cache: Redis | null | undefined;
function cache(): Redis | null {
  if (_cache !== undefined) return _cache;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // One try, bounded to a second: a cache that is down must cost a comparison nothing.
  // `retry: false` is not that, because @upstash/redis 1.39 still tries twice with it.
  _cache =
    url && token
      ? new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(1_000) })
      : null;
  return _cache;
}

/**
 * The body as text, or null past `max` bytes. Read in chunks and stopped there, so a design
 * too large to compare never costs more memory than the cap: `res.text()` held all of it
 * before its size could be checked.
 */
export async function textUpTo(res: Response, max: number): Promise<string | null> {
  // A compressed length is a floor on the real one, so over the cap is over the cap.
  if (Number(res.headers?.get("content-length")) > max) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}

async function figmaJson(
  url: string,
  token: string,
  cap: number,
  deadline: number
): Promise<{ ok: true; body: unknown } | Failure> {
  const timeoutMs = Math.min(cap, deadline - Date.now());
  if (timeoutMs < 1_000) return { ok: false, status: 0, why: "no time" };
  try {
    const res = await figmaFetch(url, { headers: { "X-Figma-Token": token }, timeoutMs }, deadline);
    if (!res.ok) return { ok: false, status: res.status, headers: res.headers };
    // The timeout covers the body too, so a design too large to arrive in time throws here.
    const text = await textUpTo(res, MAX_READ_BYTES);
    if (text === null) return { ok: false, status: res.status, why: "too big" };
    return { ok: true, body: JSON.parse(text) };
  } catch (err) {
    logger.warn({ err, url: url.split("?")[0] }, "brain: a design_changes read failed");
    const timedOut = err instanceof Error && /abort|timeout/i.test(`${err.name} ${err.message}`);
    return timedOut
      ? { ok: false, status: 0, why: "timeout", waitedMs: timeoutMs }
      : { ok: false, status: 0 };
  }
}

/**
 * Newest first, back to the first version saved before `since`. Figma pages OLDER versions
 * with `after=<id>`: its documented `before=<id>` returns the NEWER ones (checked live
 * 2026-10-11, it gave back the same 49 versions as the first page).
 */
async function listVersions(
  fileKey: string,
  token: string,
  sinceMs: number,
  deadline: number
): Promise<{ ok: true; versions: Version[]; cut: boolean } | Failure> {
  const versions: Version[] = [];
  let after = "";
  for (let page = 0; page < MAX_VERSION_PAGES; page++) {
    const res = await figmaJson(
      api(
        fileKey,
        `/files/<key>/versions?page_size=${VERSIONS_PAGE}` +
          (after ? `&after=${encodeURIComponent(after)}` : "")
      ),
      token,
      VERSIONS_TIMEOUT_MS,
      deadline
    );
    if (!res.ok) return res;
    const body = res.body as { versions?: Version[]; pagination?: { next_page?: string } };
    const batch = (body.versions ?? []).filter(
      (v) => typeof v?.id === "string" && Number.isFinite(Date.parse(v.created_at))
    );
    versions.push(...batch);
    const last = batch[batch.length - 1];
    if (
      batch.some((v) => Date.parse(v.created_at) < sinceMs) ||
      !body.pagination?.next_page ||
      !last ||
      // A page that does not move on would be asked for again until the cap.
      last.id === after
    ) {
      return { ok: true, versions, cut: false };
    }
    after = last.id;
  }
  return { ok: true, versions, cut: true };
}

async function readDesign(
  fileKey: string,
  token: string,
  versionId: string,
  nodeId: string | null,
  deadline: number,
  cap = READ_TIMEOUT_MS
): Promise<{ ok: true; name: string; root: DesignNode | null } | Failure> {
  const version = encodeURIComponent(versionId);
  const res = await figmaJson(
    nodeId
      ? api(fileKey, `/files/<key>/nodes?ids=${encodeURIComponent(nodeId)}&version=${version}`)
      : api(fileKey, `/files/<key>?version=${version}&depth=${FILE_DEPTH}`),
    token,
    cap,
    deadline
  );
  if (!res.ok) return res;
  const body = res.body as {
    name?: string;
    document?: DesignNode;
    nodes?: Record<string, { document?: DesignNode } | null>;
  };
  // A node missing at a version is `null` in `nodes`: it was made later, or deleted.
  // One id was asked for, so `nodes` holds one entry.
  const root = nodeId
    ? (Object.values(body.nodes ?? {})[0]?.document ?? null)
    : (body.document ?? null);
  return { ok: true, name: body.name ?? fileKey, root };
}

// ── The comparison ──────────────────────────────────────────────────────────────────

interface Place {
  page?: DesignNode;
  sections: DesignNode[];
  /** The outermost frame-like layer the change sits inside, below any sections. */
  frame?: DesignNode;
}

export interface Change {
  kind: "added" | "removed" | "renamed" | "text";
  id: string;
  type: string;
  /** The layer's name, or a text layer's text. */
  name: string;
  /** Before the change: the old name, or the old text. */
  was?: string;
  /** Text layers inside an added or removed layer, added or removed with it. */
  texts?: number;
  /**
   * The depth a whole file was read to, when this layer may only have moved: "removed" may
   * be moved below it, "added" moved up from below it.
   */
  orMovedBelow?: number;
  place: Place;
}

/** Each layer by id, with its ancestors from the root down: `chain.length` is its depth. */
type Indexed = Map<string, { node: DesignNode; chain: DesignNode[] }>;

/** Every layer by id, with its ancestors from the root down. */
function indexTree(root: DesignNode | null): Indexed {
  const out: Indexed = new Map();
  const walk = (node: DesignNode, chain: DesignNode[]) => {
    out.set(node.id, { node, chain });
    const next = [...chain, node];
    for (const child of node.children ?? []) walk(child, next);
  };
  if (root) walk(root, []);
  return out;
}

function placeOf(chain: DesignNode[]): Place {
  const place: Place = { sections: [] };
  for (const n of chain) {
    if (place.frame || n.type === "DOCUMENT") continue;
    if (n.type === "CANVAS") place.page = n;
    else if (n.type === "SECTION") place.sections.push(n);
    else place.frame = n;
  }
  return place;
}

/**
 * Layers added, removed, renamed or rewritten between two trees, matched by id: Figma keeps a
 * layer's id across versions, and a copy gets a new one.
 *
 * Only the OUTERMOST new or deleted layer is a change; what is inside it is counted with it,
 * so a duplicated screen is one line rather than two hundred. Layers inside an instance (ids
 * starting with `I`) come and go with their component and are not listed, except for their
 * text, which is where an instance's own copy lives.
 *
 * `depth` is how deep the trees were read. A whole file is read FILE_DEPTH levels down, and a
 * layer at that depth comes WITHOUT its children, so missing is not the same as gone: the
 * review of #562 moved a screen into a section and every layer in it was listed as removed.
 * Text is compared only in a tree read whole, the default.
 */
export function diffDesign(
  from: DesignNode | null,
  to: DesignNode | null,
  depth = Infinity
): { changes: Change[]; others: number } {
  const withText = !Number.isFinite(depth);
  const before = indexTree(from);
  const after = indexTree(to);
  const changes: Change[] = [];
  let others = 0;
  const textOf = (n: DesignNode) => n.characters ?? n.name ?? "";
  const textsInside = (n: DesignNode, elsewhere: Indexed): number =>
    (n.children ?? []).reduce(
      (sum, c) =>
        elsewhere.has(c.id) ? sum : sum + (c.type === "TEXT" ? 1 : 0) + textsInside(c, elsewhere),
      0
    );

  const outermost = (kind: "added" | "removed", tree: Indexed, other: Indexed, id: string) => {
    const { node, chain } = tree.get(id)!;
    const parent = chain[chain.length - 1];
    if ((parent && !other.has(parent.id)) || id.startsWith("I")) return;
    // In the other version the parent came without its children, so this layer may well be
    // under it still: it is not called added or removed at all.
    if (parent && other.get(parent.id)!.chain.length >= depth) return;
    // A whole file is compared without its text, so a text layer is neither listed nor counted.
    if (node.type === "TEXT" && !withText) return;
    if (!SHOWN.has(node.type ?? "")) {
      others++;
      return;
    }
    const texts = withText ? textsInside(node, other) : 0;
    changes.push({
      kind,
      id,
      type: node.type ?? "",
      name: node.type === "TEXT" ? textOf(node) : (node.name ?? ""),
      ...(texts ? { texts } : {}),
      // Anything but a page can move to or from below the depth read, which looks the same as
      // being deleted or created. Said on the line itself, where a reader cannot miss it.
      ...(!withText && node.type !== "CANVAS" ? { orMovedBelow: depth } : {}),
      place: placeOf(chain),
    });
  };

  for (const [id, { node, chain }] of after) {
    const old = before.get(id)?.node;
    if (!old) {
      outermost("added", after, before, id);
      continue;
    }
    const type = node.type ?? "";
    if (type === "TEXT" && !withText) continue;
    if (type === "TEXT" && textOf(old) !== textOf(node)) {
      // A text layer named after its text is renamed with it, so the text is the change.
      changes.push({
        kind: "text",
        id,
        type,
        name: textOf(node),
        was: textOf(old),
        place: placeOf(chain),
      });
    } else if (SHOWN.has(type) && !id.startsWith("I") && (old.name ?? "") !== (node.name ?? "")) {
      changes.push({
        kind: "renamed",
        id,
        type,
        name: node.name ?? "",
        was: old.name ?? "",
        place: placeOf(chain),
      });
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) outermost("removed", before, after, id);
  }
  return { changes, others };
}

// ── Saying it ───────────────────────────────────────────────────────────────────────

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => {
  const t = flat(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Old and new text cut to the part that changed, with a little either side: a paragraph in
 * which one word changed should read as that word, not as two paragraphs.
 */
export function excerpt(was: string, now: string, room = 90): [string, string] {
  const a = flat(was);
  const b = flat(now);
  if (a.length <= room && b.length <= room) return [a, b];
  let head = 0;
  while (head < a.length && head < b.length && a.charAt(head) === b.charAt(head)) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a.charAt(a.length - 1 - tail) === b.charAt(b.length - 1 - tail)
  )
    tail++;
  // Not `clip`, which trims: the changed part can start or end with the space that changed.
  const cut = (t: string) => {
    const lead = head > 30 ? `…${t.slice(head - 30, head)}` : t.slice(0, head);
    const middle = t.slice(head, t.length - tail);
    const rest = t.slice(t.length - tail);
    return (
      lead +
      (middle.length > room ? `${middle.slice(0, room - 1)}…` : middle) +
      (rest.length > 30 ? `${rest.slice(0, 30)}…` : rest)
    );
  };
  return [cut(a), cut(b)];
}

/** One change as a line. `where` is the section path for a change that sits in no frame. */
function line(c: Change, fileKey: string, where = "", withLink = false): string {
  const link = withLink && c.kind !== "removed" ? ` ${nodeLink(fileKey, c.id)}` : "";
  if (c.kind === "text") {
    if (flat(c.was ?? "") === flat(c.name)) {
      return `text "${clip(c.name, 90)}" changed only in its spacing or line breaks`;
    }
    const [was, now] = excerpt(c.was ?? "", c.name);
    return `text "${was}" → "${now}"`;
  }
  if (c.kind === "renamed") {
    return `renamed ${word(c.type)} "${clip(c.was ?? "", 60)}" → "${clip(c.name, 60)}"${where}${link}`;
  }
  const texts = c.texts ? ` with ${c.texts} text layer${c.texts === 1 ? "" : "s"}` : "";
  const moved = c.orMovedBelow
    ? c.kind === "removed"
      ? ` (or moved below the top ${c.orMovedBelow} levels)`
      : ` (or moved up from below the top ${c.orMovedBelow} levels)`
    : "";
  return `${c.kind} ${word(c.type)} "${clip(c.name, 90)}"${texts}${where}${moved}${link}`;
}

/** The same line many times (one label changed in every instance) is said once, counted. */
function counted(lines: string[]): string[] {
  const n = new Map<string, number>();
  for (const l of lines) n.set(l, (n.get(l) ?? 0) + 1);
  return [...n].map(([l, k]) => (k > 1 ? `${l} (×${k})` : l));
}

/**
 * The changes, grouped by page and by the frame they sit in, each frame with its link.
 * `depth` is the one the trees were read to, as for `diffDesign`.
 */
export function renderChanges(
  fileKey: string,
  diff: { changes: Change[]; others: number },
  depth = Infinity
): string {
  const { changes, others } = diff;
  const withText = !Number.isFinite(depth);
  const n = (kind: Change["kind"]) => changes.filter((c) => c.kind === kind).length;
  const othersNote = others
    ? ` ${others} other layer${others === 1 ? "" : "s"} (shapes, vectors, images) were added or removed and are not listed.`
    : "";
  if (changes.length === 0) {
    // A whole file is only read so deep, so "nothing changed" is only true that far down.
    return withText
      ? `No frames, components or text layers were added, removed, renamed or rewritten ` +
          `between these versions.${othersNote}`
      : `No pages, sections or frames in the top ${depth} levels of the file were added, ` +
          `removed or renamed between these versions.${othersNote} Deeper layers, such as a ` +
          `frame in a section inside a section, and all text are compared only for one page ` +
          `or frame.`;
  }

  type Frame = { label: string; lines: string[] };
  type Group = { label: string; top: string[]; frames: Map<string, Frame> };
  // Pages added, removed or renamed come first, before the pages themselves: found in the
  // order of the tree, they landed between two pages' lists with no heading of their own.
  const pages = new Map<string, Group>([["", { label: "", top: [], frames: new Map() }]]);
  for (const c of changes) {
    const { page, sections, frame } = c.place;
    let group = pages.get(page?.id ?? "");
    if (!group) {
      group = {
        label: page ? `Page "${clip(page.name ?? "", 80)}"` : "",
        top: [],
        frames: new Map(),
      };
      pages.set(page?.id ?? "", group);
    }
    const path = sections.map((s) => `section "${clip(s.name ?? "", 60)}"`).join(" › ");
    if (!frame) {
      group.top.push(line(c, fileKey, path ? ` in ${path}` : "", true));
      continue;
    }
    let inFrame = group.frames.get(frame.id);
    if (!inFrame) {
      inFrame = {
        label:
          `in ${path ? `${path} › ` : ""}${word(frame.type)} "${clip(frame.name ?? "", 80)}" ` +
          nodeLink(fileKey, frame.id),
        lines: [],
      };
      group.frames.set(frame.id, inFrame);
    }
    inFrame.lines.push(line(c, fileKey));
  }

  let room = MAX_LINES;
  let framesLeft = 0;
  const take = (lines: string[], max: number, indent: string): string[] => {
    const shown = Math.min(lines.length, max, room);
    room -= shown;
    const out = lines.slice(0, shown).map((l) => `${indent}${l}`);
    if (lines.length > shown) out.push(`${indent}…and ${lines.length - shown} more, not listed.`);
    return out;
  };
  const out: string[] = [
    `${changes.length} change${changes.length === 1 ? "" : "s"}` +
      (withText ? "" : ` in the top ${depth} levels`) +
      `: ${n("added")} added, ${n("removed")} removed, ${n("renamed")} renamed` +
      (withText ? `, ${n("text")} text layer${n("text") === 1 ? "" : "s"} rewritten` : "") +
      `.${othersNote}`,
  ];
  for (const group of pages.values()) {
    if (group.top.length === 0 && group.frames.size === 0) continue;
    out.push("");
    if (group.label) out.push(group.label);
    const indent = group.label ? "  " : "";
    out.push(...take(counted(group.top), MAX_TOP_LINES, indent));
    for (const frame of group.frames.values()) {
      if (room <= 0) {
        framesLeft++;
        continue;
      }
      out.push(
        `${indent}${frame.label}`,
        ...take(counted(frame.lines), MAX_LINES_PER_FRAME, `${indent}  `)
      );
    }
  }
  if (framesLeft) {
    out.push(
      "",
      `…and changes inside ${framesLeft} more frame${framesLeft === 1 ? "" : "s"}, not listed. ` +
        `Ask about one page or frame to see them.`
    );
  }
  return out.join("\n");
}

const when = (v: Version) => `${v.created_at.slice(0, 10)} ${v.created_at.slice(11, 16)} UTC`;
const who = (v: Version) => clip(v.user?.handle ?? "someone", 60);

/**
 * Who saved what, newest first. Figma saves on its own every half hour or so of work, so a
 * run of unnamed saves by one person on one day is one line; a named version is always its
 * own line, with its label and description.
 */
export function renderVersions(saved: Version[]): string {
  if (saved.length === 0) return "";
  const byPerson = new Map<string, number>();
  for (const v of saved) byPerson.set(who(v), (byPerson.get(who(v)) ?? 0) + 1);
  const named = (v: Version) => Boolean(v.label || v.description);
  const runs: Array<{ newest: Version; oldest: Version; count: number }> = [];
  for (const v of saved) {
    const run = runs[runs.length - 1];
    if (
      run &&
      !named(v) &&
      !named(run.newest) &&
      who(run.newest) === who(v) &&
      run.newest.created_at.slice(0, 10) === v.created_at.slice(0, 10)
    ) {
      run.oldest = v;
      run.count++;
    } else {
      runs.push({ newest: v, oldest: v, count: 1 });
    }
  }
  const lines = runs.map(({ newest, oldest, count }) => {
    const time =
      count > 1
        ? `${when(oldest).slice(0, 16)}–${newest.created_at.slice(11, 16)} UTC`
        : when(newest);
    return (
      `${time}  ${who(newest)}${count > 1 ? ` (${count} saves)` : ""}` +
      (newest.label ? `  "${clip(newest.label, 80)}"` : "") +
      (newest.description ? ` — ${clip(newest.description, 160)}` : "")
    );
  });
  const shown = lines.slice(0, MAX_VERSION_LINES).map((l) => `  ${l}`);
  if (lines.length > MAX_VERSION_LINES) {
    shown.push(`  …and ${lines.length - MAX_VERSION_LINES} more lines of older saves.`);
  }
  return (
    `Saved between the two: ${saved.length} version${saved.length === 1 ? "" : "s"} (` +
    [...byPerson].map(([p, k]) => `${p} ${k}`).join(", ") +
    `), newest first:\n${shown.join("\n")}`
  );
}

/** `design` is a read of the design itself, as opposed to its version list. */
function failureText(
  f: Failure,
  what: string,
  fileKey: string,
  nodeId: string | null,
  design: boolean
): string {
  const smaller = nodeId
    ? `ask about the one frame you need inside it: show_design with this node lists its frames.`
    : `ask about the one page you need: pass node.`;
  // Out of time is not too big: told apart, because the advice for each is the opposite.
  if (f.why === "no time") {
    return (
      `There was no time left to read ${what}: the reads before it took up the minute this ` +
      `has. That is Figma being slow, not a design too big to compare; ask again in a minute.`
    );
  }
  if (f.why === "too big") {
    return (
      `Figma sent more than ${MAX_READ_BYTES / 1_000_000} MB for ${what}, so it is too big ` +
      `to compare in one call. Instead, ${smaller}`
    );
  }
  if (f.why === "timeout" && design) {
    // Only a read that had the whole READ_TIMEOUT_MS and still did not finish is too big.
    const waited = f.waitedMs ?? READ_TIMEOUT_MS;
    return (
      `Figma did not send ${what} within ${Math.round(waited / 1000)} s` +
      (waited >= READ_TIMEOUT_MS
        ? `, so it is too big to compare in one call. Instead, ${smaller}`
        : `, the time this call could give it, so it may only need more time. Ask again ` +
          `in a minute; if it fails again, ${smaller}`)
    );
  }
  if (f.status === 429) return figmaLimitText(f.headers, what);
  if (f.status === 404) {
    return (
      `Figma has no file \`${fileKey}\`, or this token cannot open it (404). The file key is ` +
      `the part of the link after /design/ or /file/; pass the whole link if in doubt.`
    );
  }
  if (f.status === 401 || f.status === 403) {
    return (
      `Figma refused the credential (${f.status}) when reading ${what}. That is an access ` +
      `problem, not a design with nothing in it.`
    );
  }
  return (
    `Figma ${f.status ? `returned ${f.status}` : f.why === "timeout" ? "did not answer in time" : "could not be reached"} ` +
    `for ${what}. That is ` +
    `a failure to read the design, not a design that did not change.`
  );
}

/**
 * `since` as a moment, in UTC: a bare day is its first instant, and a time with no zone is
 * read as UTC rather than as wherever the server happens to run.
 */
export function sinceToMs(since: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) return Date.parse(`${since}T00:00:00Z`);
  const iso = since.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  return Date.parse(/(Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

/**
 * The answer to "what changed in this design since then": the newest saved version against
 * the last one saved before `since`, and who saved each version in between.
 */
export async function designChanges(
  input: { fileKey: string; nodeId: string | null; sinceMs: number; sinceLabel: string },
  token: string
): Promise<{ text: string; isError: boolean }> {
  const { fileKey, sinceMs, sinceLabel } = input;
  // 0:0 is the document itself: read whole it is the 74 MB this never reads, so it is the
  // whole-file comparison, which says how deep it looks.
  const nodeId = input.nodeId === "0:0" ? null : input.nodeId;
  const deadline = Date.now() + BUDGET_MS;

  const listed = await listVersions(fileKey, token, sinceMs, deadline);
  if (!listed.ok) {
    return {
      text: failureText(listed, "the file's version history", fileKey, nodeId, false),
      isError: true,
    };
  }
  const time = (v: Version) => Date.parse(v.created_at);
  const versions = [...listed.versions].sort((a, b) => time(b) - time(a));
  const to = versions[0];
  if (!to) {
    return { text: `Figma lists no saved versions of the file \`${fileKey}\`.`, isError: false };
  }
  if (time(to) < sinceMs) {
    return {
      text:
        `Nothing in the Figma file \`${fileKey}\` was saved since ${sinceLabel}, so nothing ` +
        `changed. The newest version was saved ${when(to)} by ${who(to)}` +
        (to.label ? `, "${clip(to.label, 80)}"` : "") +
        ".",
      isError: false,
    };
  }
  const from = versions.find((v) => time(v) < sinceMs) ?? versions[versions.length - 1]!;
  const saved = versions.filter((v) => time(v) > time(from));
  const startNote =
    time(from) < sinceMs
      ? ""
      : listed.cut
        ? `Only the newest ${versions.length} versions were read, so this starts at ${when(from)}, not at ${sinceLabel}.\n`
        : `The file's history starts at ${when(from)}, after ${sinceLabel}, so this compares its first saved version with its newest.\n`;
  if (from.id === to.id) {
    return {
      text: `${startNote}The Figma file \`${fileKey}\` has one saved version, so there is nothing to compare it with.`,
      isError: false,
    };
  }

  // v2: a whole-file comparison stopped calling layers below its depth removed (#562 review),
  // so nothing worked out the old way is served again.
  const key = `jarvis:design-changes:v2:${fileKey}:${from.id}:${to.id}:${nodeId ?? "file"}`;
  let result: { title: string; changes: string } | null = null;
  try {
    result = (await cache()?.get<{ title: string; changes: string }>(key)) ?? null;
  } catch (err) {
    logger.warn({ err }, "brain: design_changes cache unreadable, comparing afresh");
  }
  if (result) {
    logger.info({ fileKey, nodeId }, "brain: design_changes answered from the cache");
  } else {
    const read = (v: Version, cap?: number) =>
      readDesign(fileKey, token, v.id, nodeId, deadline, cap);
    // The version list is still worth having when the design itself could not be read.
    const failed = (f: Failure, v: Version) => ({
      text:
        failureText(
          f,
          `${nodeId ? `node ${nodeId}` : "the file"} as saved ${when(v)}`,
          fileKey,
          nodeId,
          true
        ) + `\n\n${renderVersions(saved)}`,
      isError: true,
    });
    // A page or frame can be tens of megabytes a version, so its two versions are read one
    // after the other, never held raw at once, and the second is not asked for when the
    // first failed. The first gets at most half the time left, so a slow one cannot leave
    // the second none. A whole file FILE_DEPTH levels deep is a few megabytes: both at once.
    let older: Awaited<ReturnType<typeof read>>;
    let newer: Awaited<ReturnType<typeof read>>;
    if (nodeId) {
      older = await read(from, Math.min(READ_TIMEOUT_MS, (deadline - Date.now()) / 2));
      if (!older.ok) return failed(older, from);
      newer = await read(to);
    } else {
      [older, newer] = await Promise.all([read(from), read(to)]);
    }
    if (!older.ok) return failed(older, from);
    if (!newer.ok) return failed(newer, to);
    const root = newer.root ?? older.root;
    if (!root) {
      return {
        text: nodeId
          ? `${noSuchNode(fileKey, nodeId)} It is in neither version.`
          : "Figma returned the file without its pages, which is a failed read, not an empty design.",
        isError: true,
      };
    }
    // A page or frame is read whole; a whole file only FILE_DEPTH levels down.
    const depth = nodeId ? Infinity : FILE_DEPTH;
    const diff = diffDesign(older.root, newer.root, depth);
    const scope = nodeId
      ? `Only ${word(root.type)} "${clip(root.name ?? "", 80)}" (${nodeId})` +
        (newer.root ? ` ${nodeLink(fileKey, nodeId)}` : ", which no longer exists") +
        (older.root ? "." : ", which is new since then.")
      : `The whole file, its top ${FILE_DEPTH} levels: its pages, what is on them and what is ` +
        `directly inside that, so a frame in a section but not one in a section inside a ` +
        `section. Text is compared only within one page or frame: ask again with node set to ` +
        `its id, or pass a link that carries node-id.`;
    result = {
      title: `${clip(newer.name, 120)} (${fileKey}). ${scope}`,
      changes: renderChanges(fileKey, diff, depth),
    };
    logger.info(
      { fileKey, nodeId, changes: diff.changes.length, others: diff.others },
      "brain: compared two versions of a design"
    );
    try {
      await cache()?.set(key, result, { ex: CACHE_SECONDS });
    } catch (err) {
      logger.warn({ err }, "brain: design_changes cache unwritable");
    }
  }

  return {
    text:
      `${result.title}\n` +
      `What changed since ${sinceLabel}: the version saved ${when(from)} by ${who(from)} against ` +
      `the newest, saved ${when(to)} by ${who(to)}. Edits after that save are not in it.\n` +
      startNote +
      `\n${result.changes}\n\n` +
      (nodeId
        ? `Compared: layers added, removed or renamed, and text. Not compared: colours, ` +
          `positions, sizes or images.`
        : `Compared: pages, sections and frames in the top ${FILE_DEPTH} levels, added, ` +
          `removed or renamed. Not compared: anything deeper, text (ask about one page or ` +
          `frame for both), colours, positions, sizes or images.`) +
      `\n\n${renderVersions(saved)}`,
    isError: false,
  };
}
