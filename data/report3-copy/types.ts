/**
 * One archetype's four V4 chapters, as its file in this folder writes them: Typical
 * Beliefs, Accelerators & Brakes, Challenges in Partnerships and Fantasy vs. Reality.
 * The shapes are the chapter modules' own, imported as types only.
 */
import type { Report3AcceleratorsCopy } from "../report3-accelerators";
import type { Report3FantasyCopy } from "../report3-fantasy";
import type { Report3PartnershipCopy } from "../report3-partnership";
import type { Report3TypicalBeliefsCopy } from "../report3-typical-beliefs";

export interface Report3ArchetypeCopy {
  typicalBeliefs: Report3TypicalBeliefsCopy;
  accelerators: Report3AcceleratorsCopy;
  partnership: Report3PartnershipCopy;
  fantasy: Report3FantasyCopy;
}
