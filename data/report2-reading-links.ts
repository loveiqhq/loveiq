/**
 * Cover art and destination for every title in Reading Recommendations
 * (Figma 8427:2777 — the design shows real cover thumbnails and "View book" /
 * "Open paper" links, but the copy matrix carries no cover or URL slot).
 *
 * Keyed by the NORMALISED title (lowercased, punctuation collapsed) so the two
 * spellings the matrix ships — "Come As You Are" and "Come as You Are" — resolve
 * to the one book. 47 distinct titles across the 14 archetypes.
 *
 * COVERS (40 of 47) are the real jackets, resolved from Open Library by title
 * + author and then checked by eye: a photo of a stranger came back for The New
 * Topping Book, three were stamped library title-page scans and four were square
 * audiobook art, so each of those was replaced from another edition of the same
 * work or dropped. Files live in `public/report/books/` and are served locally —
 * no third-party image host, no `img-src` CSP change, and no request that tells
 * another site what the reader is reading. `w`/`h` are the intrinsic pixel sizes so
 * the <img> reserves its box and the card never shifts as covers load.
 *
 * A title with `cover: null` renders the gradient text spine instead — exactly what
 * Figma itself does for the card with no jacket (the journal paper at 8427:2808).
 * Those are the five journal papers plus Anchored (Open Library holds no cover for
 * it; the only Deb Dana jacket on file is a different book) and The Science of
 * Trust (only a "WITHDRAWN" library title-page scan exists).
 *
 * DESTINATIONS. `doi` marks the academic sources, each verified against Crossref's
 * own record for that title. Everything else is a trade book and gets an Amazon
 * book search — see `readingHref()` for why a search and not a product page.
 */

export interface ReadingSource {
  /** File in `public/report/books`, or null → the gradient text spine. */
  cover: string | null;
  /** Intrinsic cover width/height in px (present only alongside a cover). */
  w?: number;
  h?: number;
  /** DOI of the academic source; absent for trade books. */
  doi?: string;
}

export const READING_SOURCES: Record<string, ReadingSource> = {
  // A General Theory of Love — Lewis, Amini & Lannon · 2000 · OL cover 228919
  "a general theory of love": { cover: "a-general-theory-of-love.jpg", w: 180, h: 277 },
  // Anchored — Deb Dana · 2021
  anchored: { cover: null },
  // Arousal: The Secret Logic of Sexual Fantasies — Michael Bader · 2002 · OL cover 178924
  "arousal the secret logic of sexual fantasies": {
    cover: "arousal-the-secret-logic-of-sexual-fantasies.jpg",
    w: 180,
    h: 268,
  },
  // Attached — Amir Levine & Rachel Heller · 2010 · OL cover 12660336
  attached: { cover: "attached.jpg", w: 180, h: 292 },
  // Becoming Cliterate — Laurie Mintz · 2017 · OL cover 13277841
  "becoming cliterate": { cover: "becoming-cliterate.jpg", w: 180, h: 271 },
  // Being Responsive and Self-Determined When it Comes to Sex — Shoikhedbrod & Rosen · 2022
  "being responsive and self determined when it comes to sex": {
    cover: null,
    doi: "10.1080/00224499.2022.2130132",
  },
  // Better Sex Through Mindfulness — Lori Brotto · 2018 · OL cover 8840579
  "better sex through mindfulness": { cover: "better-sex-through-mindfulness.jpg", w: 180, h: 277 },
  // Come as You Are — Emily Nagoski · 2015 · OL cover 8176873
  "come as you are": { cover: "come-as-you-are.jpg", w: 180, h: 270 },
  // Come Together — Emily Nagoski · 2024 · OL cover 15214469
  "come together": { cover: "come-together.jpg", w: 180, h: 288 },
  // Daring Greatly — Brené Brown · 2012 · OL cover 7367250
  "daring greatly": { cover: "daring-greatly.jpg", w: 180, h: 270 },
  // Exploring Desire & Intimacy — Gina Ogden · 2016 · OL cover 13737472
  "exploring desire intimacy": {
    cover: "exploring-desire-intimacy.jpg",
    w: 180,
    h: 232,
    doi: "10.4324/9781315678368",
  },
  // Hold Me Tight — Sue Johnson · 2008 · OL cover 2379203
  "hold me tight": { cover: "hold-me-tight.jpg", w: 180, h: 278 },
  // How to Be an Adult in Relationships — David Richo · 2002 · OL cover 817569
  "how to be an adult in relationships": {
    cover: "how-to-be-an-adult-in-relationships.jpg",
    w: 180,
    h: 268,
  },
  // Intimacy & Human Functioning — Popović · journal paper
  "intimacy human functioning": { cover: null, doi: "10.1080/14681990412331323992" },
  // It's Not Always Depression — Hilary Jacobs Hendel · 2018 · OL cover 8826389
  "it s not always depression": { cover: "it-s-not-always-depression.jpg", w: 180, h: 271 },
  // Keeping the Spark Alive: Sexual Communal Motivation — Muise et al. · 2013
  "keeping the spark alive sexual communal motivation": {
    cover: null,
    doi: "10.1177/1948550612457185",
  },
  // Mating in Captivity — Esther Perel · 2006 · OL cover 34575
  "mating in captivity": { cover: "mating-in-captivity.jpg", w: 180, h: 271 },
  // Nonviolent Communication — Marshall Rosenberg · 2015 · OL cover 940686
  "nonviolent communication": { cover: "nonviolent-communication.jpg", w: 180, h: 267 },
  // Passionate Marriage — David Schnarch · 1997 · OL cover 247068
  "passionate marriage": { cover: "passionate-marriage.jpg", w: 180, h: 280 },
  // Psychological Characteristics of BDSM Practitioners — Wismeijer & van Assen · 2013
  "psychological characteristics of bdsm practitioners": { cover: null, doi: "10.1111/jsm.12192" },
  // Quiet: The Power of Introverts in a World That Can't Stop Talking — Susan Cain · 2012 · OL cover 7079753
  "quiet the power of introverts in a world that can t stop talking": {
    cover: "quiet-the-power-of-introverts-in-a-world-that-can-t-stop-tal.jpg",
    w: 180,
    h: 270,
  },
  // Rekindling Desire — Barry & Emily McCarthy · 2003 · OL cover 11077076
  "rekindling desire": { cover: "rekindling-desire.jpg", w: 180, h: 260 },
  // Rewriting the Rules — Meg-John Barker · 2012 · OL cover 9233623
  "rewriting the rules": { cover: "rewriting-the-rules.jpg", w: 180, h: 282 },
  // Secure Love — Julie Menanno · 2024 · OL cover 14666736
  "secure love": { cover: "secure-love.jpg", w: 180, h: 271 },
  // Sensate Focus in Sex Therapy — Weiner & Avery-Clark · 2017 · OL cover 10148395
  "sensate focus in sex therapy": { cover: "sensate-focus-in-sex-therapy.jpg", w: 180, h: 232 },
  // Set Boundaries, Find Peace — Nedra Glover Tawwab · 2021 · OL cover 10543310
  "set boundaries find peace": { cover: "set-boundaries-find-peace.jpg", w: 180, h: 240 },
  // Sex for One — Betty Dodson · 1987 · OL cover 323578
  "sex for one": { cover: "sex-for-one.jpg", w: 180, h: 270 },
  // Sex Talks — Vanessa Marin · 2023 · OL cover 13198963
  "sex talks": { cover: "sex-talks.jpg", w: 180, h: 271 },
  // Sex-Specific Need Fulfilment in Relationships — McClung et al. · 2024
  "sex specific need fulfilment in relationships": { cover: null, doi: "10.3138/cjhs-2024-0031" },
  // Sexual Intelligence — Marty Klein · 2012 · OL cover 9021181
  "sexual intelligence": { cover: "sexual-intelligence.jpg", w: 180, h: 271 },
  // Tell Me What You Want — Justin Lehmiller · 2018 · OL cover 11173569
  "tell me what you want": { cover: "tell-me-what-you-want.jpg", w: 180, h: 180 },
  // The All-or-Nothing Marriage — Eli Finkel · 2017 · OL cover 8799903
  "the all or nothing marriage": { cover: "the-all-or-nothing-marriage.jpg", w: 180, h: 270 },
  // The Art of Receiving and Giving: The Wheel of Consent — Betty Martin · 2021 · OL cover 12373403
  "the art of receiving and giving the wheel of consent": {
    cover: "the-art-of-receiving-and-giving-the-wheel-of-consent.jpg",
    w: 180,
    h: 270,
  },
  // The Body Keeps the Score — Bessel van der Kolk · 2014 · OL cover 8315367
  "the body keeps the score": { cover: "the-body-keeps-the-score.jpg", w: 180, h: 276 },
  // The Dance of Connection — Harriet Lerner · 2001 · OL cover 41968
  "the dance of connection": { cover: "the-dance-of-connection.jpg", w: 180, h: 284 },
  // The Deep Psychology of BDSM and Kink — Douglas Thomas · 2023 · OL cover 14715574
  "the deep psychology of bdsm and kink": {
    cover: "the-deep-psychology-of-bdsm-and-kink.jpg",
    w: 180,
    h: 270,
  },
  // The Erotic Mind — Jack Morin · 1995 · OL cover 42749
  "the erotic mind": { cover: "the-erotic-mind.jpg", w: 180, h: 267 },
  // The Gifts of Imperfection — Brené Brown · 2010 · OL cover 7414597
  "the gifts of imperfection": { cover: "the-gifts-of-imperfection.jpg", w: 180, h: 269 },
  // The Guide to Getting It On — Paul Joannides · 2022 · OL cover 6920064
  "the guide to getting it on": { cover: "the-guide-to-getting-it-on.jpg", w: 180, h: 274 },
  // The Heart of Dominance — Anton Fulmen · 2016 · OL cover 10423232
  "the heart of dominance": { cover: "the-heart-of-dominance.jpg", w: 180, h: 270 },
  // The New Topping Book — Dossie Easton & Janet Hardy · 2003 · OL cover 12971060
  "the new topping book": { cover: "the-new-topping-book.jpg", w: 180, h: 269 },
  // The Science of Trust — John Gottman · 2011
  "the science of trust": { cover: null },
  // The Seven Principles for Making Marriage Work — John Gottman & Nan Silver · 1999 · OL cover 390037
  "the seven principles for making marriage work": {
    cover: "the-seven-principles-for-making-marriage-work.jpg",
    w: 180,
    h: 255,
  },
  // The Wisdom of Your Body — Hillary McBride · 2021 · OL cover 10867383
  "the wisdom of your body": { cover: "the-wisdom-of-your-body.jpg", w: 180, h: 269 },
  // Urban Tantra — Barbara Carrellas · 2007 · OL cover 855300
  "urban tantra": { cover: "urban-tantra.jpg", w: 180, h: 215 },
  // Why Good Sex Matters — Nan Wise · 2020 · OL cover 9279404
  "why good sex matters": { cover: "why-good-sex-matters.jpg", w: 180, h: 270 },
  // Wired for Love — Stan Tatkin · 2011 · OL cover 7946250
  "wired for love": { cover: "wired-for-love.jpg", w: 180, h: 285 },
};

const normaliseTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cover + destination for a title, or null when the title is not in the matrix. */
export function getReadingSource(title: string): ReadingSource | null {
  return READING_SOURCES[normaliseTitle(title)] ?? null;
}

/**
 * Where the card's link goes. Academic sources use their DOI, which is permanent
 * and resolves to the publisher.
 *
 * Books use an Amazon BOOK SEARCH for the exact title and author rather than a
 * `/dp/<isbn>` product page. A product link needs the ISBN-10 Amazon actually
 * lists, and Open Library's ISBNs are often a foreign or library-binding edition
 * (several here are Turkish, French and Spanish printings). Amazon serves
 * automated requests a stub page, so a candidate ISBN cannot be verified from CI
 * or a dev machine — and an unverified /dp link 404s on the reader. A title +
 * author search always lands on the book, in whichever edition Amazon stocks.
 */
export function readingHref(title: string, author: string | null): string {
  const doi = getReadingSource(title)?.doi;
  if (doi) return `https://doi.org/${doi}`;
  const query = encodeURIComponent(`${title} ${author ?? ""}`.trim());
  return `https://www.amazon.com/s?k=${query}&i=stripbooks`;
}
