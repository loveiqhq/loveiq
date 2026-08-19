"use client";

import type { FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { getReadingSource, readingHref } from "@/data/report2-reading-links";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved reading copy (`getReport2Section(name, "reading")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `readingCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier — this section is `recommendations`,
 * section 32, NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the
 * full_report tier). The framing slots (the universal category
 * tags `book1..4.tag`, `closing.lead`, `learn.eyebrow`, `learn.body`) are
 * UNIVERSAL and always shipped. The per-archetype payload — each book's
 * `title` / `author` / `blurb` and `closing.formula` — is the gated content:
 * shipped ONLY when unlocked at the full_report tier. A locked client
 * (`locked: true`) receives those null and renders the hook teaser +
 * PremiumOverlay instead. Never send locked per-archetype content to an unpaid
 * client.
 *
 * Figma note: the design (8427:2777) shows real book-cover thumbnails and
 * "View book" / "Open paper" links, and the copy matrix carries no cover-image or
 * link-URL slot for any archetype. Both come from `data/report2-reading-links.ts`,
 * which resolves all 47 distinct titles to a real jacket and a real destination —
 * see that file for how each was sourced and checked. Everything else is
 * pixel-matched to the card spec.
 */
export interface ReadingCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  "book1.tag"?: string | null;
  "book2.tag"?: string | null;
  "book3.tag"?: string | null;
  "book4.tag"?: string | null;
  "closing.lead"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  "book1.title"?: string | null;
  "book1.author"?: string | null;
  "book1.blurb"?: string | null;
  "book2.title"?: string | null;
  "book2.author"?: string | null;
  "book2.blurb"?: string | null;
  "book3.title"?: string | null;
  "book3.author"?: string | null;
  "book3.blurb"?: string | null;
  "book4.title"?: string | null;
  "book4.author"?: string | null;
  "book4.blurb"?: string | null;
  "closing.formula"?: string | null;
  /** True when the per-archetype titles/authors/blurbs/formula were withheld. */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: ReadingCopy | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

const BookIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

type Book = { tag: string | null; title: string; author: string | null; blurb: string | null };

/**
 * One book card (Figma 8427:2781): cover spine, tag eyebrow, serif title, author
 * line, blurb and the link pill.
 *
 * A title with no jacket on file falls back to the treatment Figma itself applies
 * to the card that has no cover either — the journal paper at 8427:2808: a dark
 * gradient spine with the author line small and uppercase above the title in
 * serif. So the design language holds whether or not artwork exists.
 *
 * The link label follows the destination: an academic source (one with a DOI)
 * reads "Open paper", a trade book "View book". That reproduces all four of
 * Figma's base cards, and unlike a guess from the copy it cannot mislabel — the
 * tag vocabulary ("Core pick" / "Research pick" / "The science" / "The stretch")
 * puts its research-flavoured tags on famous trade BOOKS as often as on papers.
 */
const BookCard: FC<{ book: Book }> = ({ book }) => {
  const source = getReadingSource(book.title);
  const isPaper = Boolean(source?.doi);
  return (
    <article className="report-reading__card">
      {/*
        A real object rather than a picture of one. The jacket used to be a flat
        <img> with inset shadows drawing a fake spine and fore edge; it read as a
        thumbnail. This is a three-face book in perspective — jacket, page block on
        the fore edge, spine on the hinge — so the thickness is geometry and turns
        with the book instead of being painted on. Both the real jacket and the
        no-jacket fallback ride the same shell.
      */}
      <span className="report-reading__book" aria-hidden="true">
        <span className="report-reading__book-3d">
          <span className="report-reading__book-pages" />
          <span className="report-reading__book-hinge" />
          {source?.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- 180px-wide local jacket at a 79px spine; next/image adds nothing
            <img
              className="report-reading__cover"
              src={`/report/books/${source.cover}`}
              width={source.w}
              height={source.h}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="report-reading__spine">
              {book.author ? (
                <span className="report-reading__spine-author">{book.author}</span>
              ) : null}
              <span className="report-reading__spine-title">{book.title}</span>
            </span>
          )}
          <span className="report-reading__book-gloss" />
        </span>
      </span>
      <div className="report-reading__body">
        {book.tag ? <p className="report-reading__tag">{book.tag}</p> : null}
        <h4 className="report-reading__title">{book.title}</h4>
        {book.author ? <p className="report-reading__author">{book.author}</p> : null}
        {book.blurb ? <p className="report-reading__blurb">{book.blurb}</p> : null}
        <a
          className="report-reading__link"
          href={readingHref(book.title, book.author)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {isPaper ? "Open paper" : "View book"}
        </a>
      </div>
    </article>
  );
};

const ReadingSection: FC<Props> = ({
  archetype,
  copy,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  if (!copy) return null;

  const locked = copy.locked;

  // Collect the books that actually have a title — render only books whose
  // title slot exists (counts vary per archetype; tag/author/blurb are optional
  // per book). Never fabricate a book.
  const books: Book[] = ([1, 2, 3, 4] as const)
    .map((i) => ({
      tag: copy[`book${i}.tag`]?.trim() || null,
      title: copy[`book${i}.title`]?.trim() ?? "",
      author: copy[`book${i}.author`]?.trim() || null,
      blurb: copy[`book${i}.blurb`]?.trim() || null,
    }))
    .filter((b): b is Book => b.title.length > 0);

  const closingLead = copy["closing.lead"]?.trim() || null;
  const closingFormula = copy["closing.formula"]?.trim() || null;

  return (
    <div className="report-reading">
      <h3 className="report-reading__heading">Reading Recommendations</h3>

      {copy["learn.body"] ? (
        <div className="report-reading__learn-pill-wrap">
          <span className="report-reading__learn-pill">
            <span className="report-reading__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-reading__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      {locked ? (
        <div className="report-reading__preview">
          {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
              build time means the paid copy is not in the file that ships, so
              it cannot be read back out of the DOM. See LockedPreviewImage. */}
          <div
            className="report-reading__preview-fade report-preview-fade--image"
            aria-hidden="true"
          >
            <LockedPreviewImage name="reading" />
          </div>
          <PremiumOverlay
            archetype={archetype}
            sectionTitle={sectionTitle}
            tier={tier}
            quote={quote}
            offerDeadline={offerDeadline}
            onUnlock={onUnlock}
          />
        </div>
      ) : (
        <>
          {books.length > 0 ? (
            <div className="report-reading__grid">
              {books.map((book, i) => (
                <BookCard key={i} book={book} />
              ))}
            </div>
          ) : null}

          {/* The closing line ("Your sexuality isn't complicated. It's …") was
              removed on request: it restates the chapter after the books have
              already made the point, and the reading list reads better ending on
              the shelf. `closing.lead` / `closing.formula` stay in the copy
              matrix and on the props so nothing else that reads them breaks. */}
        </>
      )}
    </div>
  );
};

export default ReadingSection;
