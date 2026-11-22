/**
 * Talking to Mira (Mark's board "Main", Talk; Eman, 21 Nov 2026): the browser's own speech
 * services, nothing of ours. Speech becomes text in the browser (Chrome on the device where it
 * can, else the browser maker's service), the text goes to the chat like a typed message, and
 * her reply is read aloud only by a voice that lives on the device. Audio never reaches us.
 *
 * These are the text rules around those services; useVoice.ts runs them.
 */
import { REPLY_LANGUAGES } from "@features/mira/reply-languages";

/** Where speech can become text: the device itself, or the browser maker's service. */
export type RecognitionMode = "device" | "service";

type RecognitionOptions = { langs: string[]; processLocally: boolean };
type Availability = "unavailable" | "downloadable" | "downloading" | "available";

/** The Web Speech API's recognizer, as far as Mira uses it (prefixed in Safari and older Chrome). */
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface RecognizerClass {
  new (): Recognizer;
  /** On-device recognition (Chrome 139+): whether a language can be heard locally, and its download. */
  available?: (o: RecognitionOptions) => Promise<Availability>;
  install?: (o: RecognitionOptions) => Promise<boolean>;
}

/** The browser's own recognizer, wherever the page may use it; null where none exists (Firefox). */
function browserRecognizer(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, RecognizerClass | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can turn speech into text at all: Talk needs Chrome, Safari or Edge. */
export const canRecognizeSpeech = (): boolean => browserRecognizer() !== null;

/**
 * The browser's recognizer, or null where none exists (Firefox) or the page may not use the
 * microphone (its Permissions-Policy, see proxy.ts): then Talk is not offered at all.
 */
export function recognizerClass(): RecognizerClass | null {
  const found = browserRecognizer();
  const policy = (document as { featurePolicy?: { allowsFeature?: (f: string) => boolean } })
    .featurePolicy;
  if (!found || policy?.allowsFeature?.("microphone") === false) return null;
  return found;
}

/** The longest Talk waits for the browser to fetch a language for the device (the panel says so). */
export const INSTALL_WAIT_MS = 20_000;

/**
 * On the device when the browser can (and fetches the language once, which needs the tap that
 * started this; `installing` hears when that wait begins), else the browser's service. A
 * download that hangs falls back after INSTALL_WAIT_MS.
 */
export async function chooseMode(
  Recognizer: RecognizerClass,
  lang: string,
  installing?: () => void
): Promise<RecognitionMode> {
  if (typeof Recognizer.available !== "function") return "service";
  const options = { langs: [lang], processLocally: true };
  try {
    const status = await Recognizer.available(options);
    if (status === "available") return "device";
    if (status === "unavailable" || typeof Recognizer.install !== "function") return "service";
    installing?.();
    const timeout = new Promise<boolean>((done) => setTimeout(() => done(false), INSTALL_WAIT_MS));
    return (await Promise.race([Recognizer.install(options), timeout])) ? "device" : "service";
  } catch {
    return "service";
  }
}

/**
 * The language speech becomes text in, so crisis words are heard in the person's own language
 * (server/safety.ts reads them in each reply language): the language Mira replies in when one is
 * chosen (its tag in reply-languages.ts), else the browser's own, else US English.
 */
export function recognitionLang(
  replyLanguage: string | null | undefined,
  browser: string | undefined
): string {
  const chosen = REPLY_LANGUAGES.find((l) => l.code === replyLanguage);
  if (chosen) return chosen.speech;
  return browser && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(browser) ? browser : "en-US";
}

/** English device voices that tend to sound calm, by name; any local voice of the language will do. */
const CALM = [
  "Samantha",
  "Ava",
  "Allison",
  "Serena",
  "Karen",
  "Moira",
  "Tessa",
  "Fiona",
  "Zira",
  "Hazel",
  "Libby",
  "Sonia",
];

/**
 * A voice on the device only (`localService`): a cloud voice would send Mira's words, and so what
 * the person told her, to another company. Only voices of the listening language (her reply is in
 * it); its own region first, then the better quality voices, then a calm one; the device's own
 * order otherwise. None: she answers in writing.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | null {
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const language = (l: string) => norm(l).split("-")[0];
  const region = (l: string) =>
    norm(l)
      .split("-")
      .slice(1)
      .find((part) => part.length === 2);
  const score = (v: SpeechSynthesisVoice) =>
    (region(v.lang) === region(lang) ? 4 : 0) +
    (/premium|enhanced/i.test(v.name) ? 2 : 0) +
    (CALM.some((n) => v.name.includes(n)) ? 1 : 0);
  const local = voices.filter((v) => v.localService && language(v.lang) === language(lang));
  return [...local].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Mira's words as they should sound: no app markers, web addresses or links (with the "at" that
 * led to them), no markdown or emoji, and every line ending as a sentence so she pauses there.
 */
export function forSpeech(text: string): string {
  return text
    .replace(/\[\[[^\]\n]*\]\]/g, "")
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(
      /\s*\b(?:at|on|via|or|from)?\s*(?:https?:\/\/|www\.)?(?:[a-z0-9-]+\.)+(?:org|com|de|net|io|eu)(?:\/[^\s)]*)?/gi,
      (match) => (/[a-z0-9-]+\.(?:org|com|de|net|io|eu)\b/i.test(match) ? "" : match)
    )
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/[*_`#]+/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s+/, "").trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;,]$/.test(line) ? line : `${line}.`))
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A piece this short (an "Okay.") is said together with the sentence after it. */
const SHORTEST = 7;

/** A reply as sentences: long utterances stall in some browsers, and the caption follows her. */
export function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out: string[] = [];
  let carry = "";
  for (const part of parts) {
    const s = carry ? `${carry} ${part}` : part;
    if (s.length < SHORTEST && part !== parts.at(-1)) carry = s;
    else {
      out.push(s);
      carry = "";
    }
  }
  return out;
}

/** Words in any script, Japanese or Thai (written without spaces) too: the browser's own splitter. */
const WORDS = new Intl.Segmenter(undefined, { granularity: "word" });
const wordsOf = (s: string) =>
  Array.from(WORDS.segment(s.toLowerCase()))
    .filter((w) => w.isWordLike)
    .map((w) => w.segment.replace(/'s$|s$/, ""));

/** Mostly Mira's own words, heard back through the speakers (allowing for mishearing). */
export function isEcho(heard: string, said: string): boolean {
  const words = wordsOf(heard);
  if (words.length === 0) return true;
  const hers = new Set(wordsOf(said));
  return words.filter((w) => hers.has(w)).length / words.length >= 0.6;
}

/**
 * While Mira speaks: the recognizer's settled results that were only her echo (or a single word)
 * move the floor past them, so they never join the person's turn; two or more words of the
 * person's own stop her (barge-in). One word ("hmm") is not enough: they can tap to stop her.
 */
export function readWhileSpeaking(
  results: ReadonlyArray<{ text: string; final: boolean }>,
  floor: number,
  said: string
): { floor: number; bargeIn: boolean } {
  let next = floor;
  for (let i = floor; i < results.length; i++) {
    const r = results[i]!;
    if (wordsOf(r.text).length >= 2 && !isEcho(r.text, said)) return { floor: next, bargeIn: true };
    if (r.final && next === i) next = i + 1;
  }
  return { floor: next, bargeIn: false };
}

/**
 * Just after she stops: the recognizer can still bring back her last words (it runs behind the
 * speakers). Results of two or more of her words are skipped once settled, and wait while not;
 * anything else, a one-word "okay" too, is the person's.
 */
export function readAfterSpeaking(
  results: ReadonlyArray<{ text: string; final: boolean }>,
  floor: number,
  said: string
): { floor: number; settling: boolean } {
  let next = floor;
  for (; next < results.length; next++) {
    const r = results[next]!;
    if (wordsOf(r.text).length < 2 || !isEcho(r.text, said)) break;
    if (!r.final) return { floor: next, settling: true };
  }
  return { floor: next, settling: false };
}
