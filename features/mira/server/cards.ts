import cardsJson from "../content/evidence-cards.json";

/**
 * The evidence cards: the only research Mira reads. One card per source of Sanjin's evidence
 * library, in our own words, with the labels from the team's proposal ("Mira: how each source
 * is labelled and used"). For the beta: the 27 core sources we may use (C24 to C27 are books we
 * have not bought). Each card was checked on 20 Nov 2026 against its public record and abstract
 * (the open papers in full): citation, figures, who was studied and the evidence level. Only a
 * card marked quoteAllowed (an open CC BY paper) may be quoted; every other card is used in
 * Mira's own words.
 *
 * All of them fit in the cached part of her instructions, so there is no search to miss a card.
 * Past about 150 cards a search will pick the best ones per message instead.
 */
export type EvidenceCard = {
  id: string;
  title: string;
  authors: string;
  year: number;
  citation: string;
  link: string | null;
  labels: {
    type: string;
    evidence: string;
    priority: string;
    copyright: string;
    usedFor: string[];
    tags: string[];
    studiedIn: string;
  };
  quoteAllowed: boolean;
  basis: string;
  card: string;
};

export const EVIDENCE_CARDS = cardsJson as EvidenceCard[];

const BY_ID = new Map(EVIDENCE_CARDS.map((c) => [c.id, c]));

export function cardById(id: string): EvidenceCard | undefined {
  return BY_ID.get(id);
}

/** The cards as Mira reads them: labels first, so she can word each claim at its evidence level. */
export function renderCards(cards: EvidenceCard[] = EVIDENCE_CARDS): string {
  return cards
    .map((c) =>
      [
        `[${c.id}] ${c.title} (${c.authors}, ${c.year})`,
        `Evidence: ${c.labels.evidence} | Used for: ${c.labels.usedFor.join(", ")} | Studied in: ${
          c.labels.studiedIn
        } | Tags: ${c.labels.tags.join(", ")} | Quote allowed: ${c.quoteAllowed ? "yes" : "no"}`,
        c.card,
      ].join("\n")
    )
    .join("\n\n");
}
