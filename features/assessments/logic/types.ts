/**
 * An instrument as the Assessment Factory holds it: exactly what the published source says,
 * plus what we add around it (copy for each band, what to do next, how to keep a person safe).
 *
 * The source's part is never paraphrased. Item wording, response options, timeframe, scoring
 * and cutoffs come from the cited source and a person checks them against it before the
 * instrument can be marked validated (see `validationPack`). Our part is marked as ours, so
 * a reviewer can see which words they are signing off as faithful and which as good copy.
 */

/** Where an instrument sits in the Humangraph (Applied Psychometrics, "Mapping the human mind"). */
export type HumangraphDimension =
  "affect" | "anxiety" | "attachment" | "desire" | "meaning" | "regulation";

/**
 * draft: being assembled; in-validation: with Mark and Sanjin; validated: signed off and
 * safe to put in front of people; retired: kept so past results still resolve.
 */
export type InstrumentStatus = "draft" | "in-validation" | "validated" | "retired";

export interface ResponseOption {
  value: number;
  label: string;
}

export interface Item {
  /** Stable forever: stored results point at it. "gad7_1". */
  id: string;
  /** Verbatim from the source. */
  text: string;
  /** Scored in reverse (a higher answer means less of the construct). */
  reverse?: boolean;
  /** Asked but not part of the total (PHQ-9's difficulty question). */
  unscored?: boolean;
  /** Its own options instead of the instrument's shared scale. */
  options?: ResponseOption[];
}

export interface Band {
  /** Inclusive on both ends, on the total score. */
  min: number;
  max: number;
  /** The source's own label for the range, verbatim ("Mild"). */
  label: string;
  /** Ours: one or two sentences a person reads for this range. Screening language only. */
  summary: string;
  /** Ours: the next step we route them to. */
  nextStep: string;
}

/** Where to get help, for one country (ISO 3166 alpha-2), or `ANY` for everywhere else. */
export interface HelpLines {
  region: string;
  lines: string[];
}

/**
 * A rule that overrides everything else on the screen: an answer that may mean a person is
 * not safe. It is never behind a paywall, never delayed, never softened by the band copy:
 * when it triggers, its `nextStep` replaces the band's (`scoreInstrument` does that).
 */
export interface SafetyRule {
  /** The item it watches, and the answers that trigger it (any answer at or above `atLeast`). */
  item: string;
  atLeast: number;
  /** Ours, reviewed clinically: what the person sees at once. */
  message: string;
  /** Ours: replaces the band's next step whenever the rule triggers. */
  nextStep: string;
  /** Where to get help now, by country, with an `ANY` entry for everywhere else. */
  resources: HelpLines[];
}

export interface Citation {
  text: string;
  doi?: string;
  url?: string;
}

export interface License {
  /**
   * public-domain: free to use, no permission needed. attribution: free with a credit line.
   * permission: needs a written license (commercial use especially). unknown: not checked yet.
   */
  kind: "public-domain" | "attribution" | "permission" | "unknown";
  /** What the terms say, and where they were read. */
  terms: string;
  source: string;
  /** The credit line to show wherever the instrument is used, when there is one. */
  attribution?: string;
  /** permission only: who granted it, and when. Required before `validated`. */
  granted?: string;
}

/** The one published form the wording is copied from, so "word for word" has a referent. */
export interface PublishedForm {
  title: string;
  url: string;
  /** When it was read (YYYY-MM-DD). */
  retrieved: string;
  /** How our version differs from it, if at all (e.g. interview wording made self-completion). */
  adaptation?: string;
}

/** One line of the human sign-off. Filled in by the reviewer, never by code. */
export interface SignOff {
  check: string;
  by?: string;
  on?: string;
  note?: string;
}

export interface InstrumentDefinition {
  id: string;
  /** "Generalized Anxiety Disorder 7-item scale" */
  name: string;
  /** "GAD-7" */
  shortName: string;
  /** Our packaging of it; a change to any scored part is a new version. */
  version: string;
  status: InstrumentStatus;
  construct: string;
  humangraph: HumangraphDimension;
  /** We screen; we never diagnose. The only value there is. */
  purpose: "screening";
  license: License;
  citations: Citation[];
  form: PublishedForm;
  /** Whose band ranges and labels these are: the source's, or ours when it gives none. */
  bandsFrom: "source" | "ours";
  /** Shown before the items, verbatim ("Over the last 2 weeks, how often have you been …"). */
  instructions: string;
  /** The answer scale every item uses unless it names its own. */
  scale: ResponseOption[];
  items: Item[];
  scoring: {
    /** sum: the total is the sum of scored items. mean: their average. */
    method: "sum" | "mean";
  };
  bands: Band[];
  safety?: SafetyRule[];
  /** Filled in by Mark and Sanjin; `validated` needs every line signed. */
  signOff: SignOff[];
  /**
   * `reviewHash(def)` at the moment of sign-off. A change to anything the sign-off covers
   * (the wording, answers, scoring, bands, our copy, the safety routing, the license)
   * changes the hash, and the gate then refuses `validated` until it is signed again.
   */
  signedHash?: string;
}
