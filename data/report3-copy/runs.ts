/**
 * The block and run constructors the per-archetype copy files are written in (one per
 * archetype in this folder). The same shapes as the Spark Seeker chapter modules' own
 * module-private helpers, so a transcribed chapter reads like a hand-set one.
 *
 * No copy here: this module is safe anywhere.
 */
import type { Report3Run } from "../report3-archetype-page";
import type { Report3Block } from "../report3-learn-more";

/** Regular. */
export const t = (text: string): Report3Run => ({ text });
/** Bold. */
export const b = (text: string): Report3Run => ({ text, weight: 700 });
/** Italic: quoted beliefs and inner speech. */
export const i = (text: string): Report3Run => ({ text, italic: true });
/** Bold italic. */
export const bi = (text: string): Report3Run => ({ text, weight: 700, italic: true });

/** A paragraph of runs. */
export const p = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs });
/** A paragraph with no rule below it. */
export const pt = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs, tight: true });
/** A subheading (Lora 16). */
export const h = (text: string): Report3Block => ({ kind: "heading", text });
/** A chapter-level heading (Lora 18). */
export const h2 = (text: string): Report3Block => ({ kind: "heading", text, level: 2 });
/** A bulleted list, one array of runs per item. */
export const ul = (...items: Report3Run[][]): Report3Block => ({ kind: "list", items });
/** A numbered list. */
export const ol = (...items: Report3Run[][]): Report3Block => ({
  kind: "list",
  ordered: true,
  items,
});
