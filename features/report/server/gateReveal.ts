import { buildArchetypeCard } from "@/data/report3-archetype-card";
import { report4ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import {
  GATE_REVEAL_OPEN_KEYS,
  type GateReveal,
  type GateRevealAspect,
} from "@features/report/logic/gateReveal";
import { scrambleLockedText } from "./scrambleLockedText";

/**
 * The board's sentence case: the report's "How Desire Gets Spoken" (its 02.10 heading case)
 * reads "How desire gets spoken" here. The four subtitles hold no names or acronyms.
 */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/**
 * The gate's reveal for one reader (features/report/logic/gateReveal.ts), from the report's
 * own archetype card (data/report3-archetype-card.ts) and the archetype's one line. Null for
 * an archetype with no card copy: the gate then draws as it always has.
 *
 * A locked card's sentence is always scrambled, whatever lockedBlurCopy.ts says for the
 * report: the gate is the place that withholds the report (initialUnlockGate.ts).
 */
export function buildGateReveal(
  archetype: string | null | undefined,
  percentages: Readonly<Record<string, number>> | null | undefined
): GateReveal | null {
  if (!archetype) return null;
  const card = buildArchetypeCard(archetype);
  if (!card) return null;
  const share = percentages?.[archetype];
  const matchStrength =
    typeof share === "number" && Number.isFinite(share)
      ? Math.max(0, Math.min(100, Math.round(share)))
      : 0;
  const aspect = (
    key: GateRevealAspect["key"],
    title: string,
    subtitle: string,
    value: string,
    body: string
  ): GateRevealAspect => {
    const locked = !GATE_REVEAL_OPEN_KEYS.has(key);
    return {
      key,
      title,
      subtitle: sentence(subtitle),
      value,
      body: locked ? scrambleLockedText(body) : body,
      locked,
    };
  };
  return {
    archetype,
    matchStrength,
    blurb: report4ArchetypeBlurbs[archetype] ?? null,
    aspects: [
      aspect(
        "motivation",
        "Core motivation",
        "What drives your desire",
        card.coreMotivation.value,
        card.coreMotivation.body
      ),
      ...card.dimensions.map((d) => aspect(d.key, d.title, d.subtitle, d.value, d.body)),
    ],
  };
}

export { gateRevealArmFor, isGateRevealEnabled } from "./gateRevealSwitch";
