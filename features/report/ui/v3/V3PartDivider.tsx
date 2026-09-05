import type { FC } from "react";

/**
 * Part divider — Figma 10392:18805 ("PART I / Your Constellation").
 *
 * A 148px band carrying the same two-radial glow the Introduction heading uses,
 * with the eyebrow at y=48 and the title at y=80. The title's first word stays
 * near-black (#191a1b) while the rest takes brand violet.
 */
interface Props {
  /** e.g. "Part I" — rendered uppercase with 2.6px tracking. */
  eyebrow: string;
  /** The plain-coloured lead word(s), e.g. "Your". */
  lead: string;
  /** The violet italic remainder, e.g. "Constellation". */
  accent: string;
  /** Optional plain-coloured suffix, e.g. " works" in "How the X works". */
  tail?: string;
}

const V3PartDivider: FC<Props> = ({ eyebrow, lead, accent, tail }) => (
  <div className="rv3-glow rv3-part rv3-part__glow" data-node-id="10392:18805">
    <p className="rv3-part__eyebrow">{eyebrow}</p>
    <p className="rv3-part__title">
      <span>{lead}</span>
      <span>{accent}</span>
      {tail ? <span>{tail}</span> : null}
    </p>
  </div>
);

export default V3PartDivider;
