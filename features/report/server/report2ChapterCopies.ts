import { getReport2Config, getReport2Section } from "@/data/report2";
import { getAttachmentPlaneForFamily } from "@/data/report2-attachment-planes";
import { archetypeSlug as report2ArchetypeSlug } from "@/data/report2-config";
import { getLibidoLoopSteps } from "@/data/report2-libido-loops";
import { getLoveLanguageOrder } from "@/data/report2-love-languages";
import { getPowerZone } from "@/data/report2-power-zones";
import { getRelationshipFit } from "@/data/report2-relationship-fit";
import { getRewardProfile } from "@/data/report2-reward";
import type { AttachmentPlane } from "@features/report/ui/sections/AttachmentPatternsSection";

/**
 * Report 2.0's chapters, Attachment Style through Confidence Level — every chapter
 * body /api/report builds from the archetype on screen: its copy, and the chart
 * config that goes with it. Moved here verbatim from app/api/report/route.ts on
 * 27.09 so the staging preview route (/api/report/preview) can build the same
 * chapters: it sent copy for four chapters only, so every other 2.0 chapter opened
 * onto an empty body in the preview Mark reviews ("show the report 2.0 version in the
 * other chapters").
 *
 * `unlocked(sectionId)` is the caller's gate for one chapter — the real route asks
 * for the tier held for the archetype on screen (`contentArchetypeTier`), the preview
 * for its plan's. The comments below were written for the route and say "shared
 * viewers inherit the owner's plan via `accessPlan`": that is now the caller's gate.
 * Both callers still pass their whole payload through contentGating's edu-body strip,
 * which clips `edu.body.*` for a locked reader.
 */

// The attachment-plane config coords (e.g. Spiritual Lover home=[150,372]) live
// in a ~0..520 design space over the Figma map box (8427:1488). Dividing by 520
// lands the dots at the exact fractions the Figma renders them (home ≈ 28.8%/
// 71.4%, strain ≈ 34.6%/34.2%), verified against node 8427:1488. Returns null
// for the 13 archetypes whose `attachment_plane` is null or malformed — coords
// are NEVER fabricated (per DECISIONS-2026-07-30).
const ATTACHMENT_PLANE_SPACE = 520;
const ATTACHMENT_CORNERS = new Set(["ANXIOUS", "FEARFUL", "SECURE", "AVOIDANT"]);

function normalizeAttachmentPlane(raw: unknown): AttachmentPlane | null {
  if (!raw || typeof raw !== "object") return null;
  const plane = raw as Record<string, unknown>;
  const toPoint = (v: unknown): { x: number; y: number } | null => {
    if (!Array.isArray(v) || v.length < 2) return null;
    const [x, y] = v;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x / ATTACHMENT_PLANE_SPACE, y: y / ATTACHMENT_PLANE_SPACE };
  };

  const home = toPoint(plane.home);
  if (!home) return null; // no home dot ⇒ nothing meaningful to draw.

  const accent = typeof plane.accent_corner === "string" ? plane.accent_corner : "";
  return {
    home,
    strain: toPoint(plane.strain),
    homeLabel: typeof plane.home_label === "string" ? plane.home_label : "",
    strainLabel: typeof plane.strain_label === "string" ? plane.strain_label : "",
    accentCorner: (ATTACHMENT_CORNERS.has(accent)
      ? accent
      : "SECURE") as AttachmentPlane["accentCorner"],
  };
}

// Reward-meter config → the client shape. `reward_order` is the four
// neurochemicals in the reader's rank order; `reward_roles` the role per rank;
// `reward_meters` the fill % per rank. Returns null (⇒ no bars) when there is no
// real `order`, so meters/rankings are NEVER fabricated for the 11 archetypes
// without config (only Spiritual Lover has full meters today; Spark Seeker /
// Sensual Connector carry order but null meters). Called only when unlocked.
function normalizeRewardConfig(cfg: Record<string, unknown> | null | undefined): {
  order: string[];
  roles: string[];
  meters: number[];
} | null {
  if (!cfg) return null;
  const order = Array.isArray(cfg.reward_order)
    ? cfg.reward_order.filter((v): v is string => typeof v === "string")
    : [];
  if (order.length === 0) return null;
  const roles = Array.isArray(cfg.reward_roles)
    ? cfg.reward_roles.filter((v): v is string => typeof v === "string")
    : [];
  const meters = Array.isArray(cfg.reward_meters)
    ? cfg.reward_meters.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
  return { order, roles, meters };
}

// Energy config → the client shape. `families.energy` (wave/spike/steady/
// conditional) selects the highlighted curve; `energy_scale_graph.highlighted_curve`
// is the specific curve id (kept for parity). `energy_readouts` = { energy, risk,
// endurance } small integer levels drive the readout meters — returned only when
// all three are finite integers, so meters are NEVER fabricated for the 13
// archetypes whose `energy_readouts` is null (only Spiritual Lover has them
// today). Called only when unlocked; the curve family always resolves (falls back
// to "wave", the Figma default) so the graph framing renders for every archetype.
function normalizeEnergyConfig(cfg: Record<string, unknown> | null | undefined): {
  curveFamily: string;
  curveId: string | null;
  readouts: { energy: number; risk: number; endurance: number } | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const curveFamily = typeof families?.energy === "string" ? families.energy : "wave";
  const scaleGraph = (cfg.energy_scale_graph as Record<string, unknown> | null | undefined) ?? null;
  const curveId =
    scaleGraph && typeof scaleGraph.highlighted_curve === "string"
      ? scaleGraph.highlighted_curve
      : null;
  const ro = (cfg.energy_readouts as Record<string, unknown> | null | undefined) ?? null;
  const level = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const energy = level(ro?.energy);
  const risk = level(ro?.risk);
  const endurance = level(ro?.endurance);
  const readouts =
    energy != null && risk != null && endurance != null ? { energy, risk, endurance } : null;
  return { curveFamily, curveId, readouts };
}

// Arousal config → the client shape. `families.arousal` (responsive/spontaneous/
// contextual) selects the arc shape; `arousal_acts` is the 3-part phase-label
// array (e.g. ["The build","The dip","The return"]). The family always resolves
// (falls back to "responsive", the Figma default) so the arc always renders;
// `acts` is null when the archetype has no `arousal_acts` (⇒ the component uses
// the family's default Figma labels — never fabricated). Called only when
// unlocked.
function normalizeArousalConfig(cfg: Record<string, unknown> | null | undefined): {
  family: string;
  acts: string[] | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const family = typeof families?.arousal === "string" ? families.arousal : "responsive";
  const rawActs = Array.isArray(cfg.arousal_acts)
    ? cfg.arousal_acts.filter((v): v is string => typeof v === "string")
    : [];
  const acts = rawActs.length === 3 ? rawActs : null;
  return { family, acts };
}

// Initiation timeline-chart config → the client shape. `families.initiation`
// (lost-in-translation/heard-too-loudly) selects the two-column mismatch shape
// + labels; `initiation_variant` (e.g. "presence-led") is a per-archetype
// accent. The family always resolves (falls back to "lost-in-translation", the
// Figma default) so the chart always renders. Called only when unlocked.
function normalizeInitiationConfig(cfg: Record<string, unknown> | null | undefined): {
  family: string;
  variant: string | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const family =
    typeof families?.initiation === "string" ? families.initiation : "lost-in-translation";
  const variant = typeof cfg.initiation_variant === "string" ? cfg.initiation_variant : null;
  return { family, variant };
}

export function buildReport2ChapterCopies(
  contentArchetype: string,
  unlocked: (sectionId: string) => boolean
) {
  // Report 2.0 Attachment Style section copy — a Part II, essentials-tier
  // PREMIUM section (section 8). The universal slots (`eyebrow`,
  // `edu.*`, `learn.*`) are always shipped. The per-archetype payload — the
  // result word, the three row VALUES, the insight value, the map caption
  // (`body.p1`), and the attachment-plane coordinates — is the gated content:
  // shipped ONLY when the report is unlocked at the essentials tier (or
  // above). A locked client NEVER receives it. Shared viewers inherit the
  // owner's plan via `accessPlan`. Keyed to the primary archetype. The row2/
  // row3 LABELS are family-specific and resolved client-side from
  // `attachmentFamily` (below), not from copy. `attachmentPlane` carries the
  // config geometry normalized to the map's 0..1 axis box; null for the 13
  // archetypes without real coords (never fabricated).
  const attachmentSection = getReport2Section(contentArchetype, "attachment");
  const attachmentUnlocked = unlocked("attachment_style");
  const attachmentConfig = getReport2Config(contentArchetype);
  const attachmentFamily = attachmentConfig?.families?.attachment ?? null;
  // Geometry is keyed by attachment FAMILY, per Mark's handoff ("chart geometry
  // ... lives in the Figma components, not the copy. Only the ... dot-position
  // slot changes per archetype, from the `families` value") and the designer's
  // three scales (Figma 9108:549 / 9107:549 / 9107:571), which together cover
  // 7 + 6 + 1 = all 14 archetypes. `attachment_plane` is only ever set on
  // spiritual-lover, so without the family fallback 13 of 14 drew an empty map.
  // Per-archetype config still wins where present.
  const attachmentPlane = attachmentUnlocked
    ? normalizeAttachmentPlane(
        attachmentConfig?.attachment_plane ?? getAttachmentPlaneForFamily(attachmentFamily)
      )
    : null;
  const attachmentCopy = {
    eyebrow: attachmentSection.eyebrow ?? null,
    "edu.eyebrow": attachmentSection["edu.eyebrow"] ?? null,
    "edu.teaser": attachmentSection["edu.teaser"] ?? null,
    "edu.body.p1": attachmentSection["edu.body.p1"] ?? null,
    "edu.body.p2": attachmentSection["edu.body.p2"] ?? null,
    "edu.body.p3": attachmentSection["edu.body.p3"] ?? null,
    "edu.body.p4": attachmentSection["edu.body.p4"] ?? null,
    "edu.body.p5": attachmentSection["edu.body.p5"] ?? null,
    "edu.body.p6": attachmentSection["edu.body.p6"] ?? null,
    "edu.body.p7": attachmentSection["edu.body.p7"] ?? null,
    "learn.eyebrow": attachmentSection["learn.eyebrow"] ?? null,
    "learn.body": attachmentSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    result: attachmentUnlocked ? (attachmentSection.result ?? null) : null,
    "row1.label": attachmentSection["row1.label"] ?? null,
    "row1.value": attachmentUnlocked ? (attachmentSection["row1.value"] ?? null) : null,
    "row2.value": attachmentUnlocked ? (attachmentSection["row2.value"] ?? null) : null,
    "row3.value": attachmentUnlocked ? (attachmentSection["row3.value"] ?? null) : null,
    "insight.label": attachmentSection["insight.label"] ?? null,
    "insight.value": attachmentUnlocked ? (attachmentSection["insight.value"] ?? null) : null,
    "body.p1": attachmentUnlocked ? (attachmentSection["body.p1"] ?? null) : null,
    locked: !attachmentUnlocked,
  };

  // Report 2.0 Core Insecurities section copy — a Part II, essentials-tier
  // PREMIUM section (section 9). The universal slots (`practical.label`,
  // `learn.*`) are always shipped. The per-archetype
  // payload — `takeaway`, the practical teaser + three practical lines, and
  // the `body.p1` sensitivity paragraph — is the gated content: shipped ONLY
  // when the report is unlocked at the essentials tier (or above). A locked
  // client NEVER receives it (nor the highlighted-curve/axis specifics; the
  // cue family + graph config below are only sent when unlocked). Shared
  // viewers inherit the owner's plan via `accessPlan`. Keyed to the primary
  // archetype. The cue family drives the graph's highlighted curve + axis
  // labels client-side (config `insecurity_graph` wins when present — only
  // Spiritual Lover has a full one today; the rest derive from the family).
  const insecuritiesSection = getReport2Section(contentArchetype, "insecurities");
  const insecuritiesUnlocked = unlocked("core_insecurities");
  const insecuritiesConfig = getReport2Config(contentArchetype);
  const insecurityCueFamily = insecuritiesUnlocked
    ? (insecuritiesConfig?.families?.insecurity_cue ?? null)
    : null;
  const insecurityGraph = insecuritiesUnlocked
    ? ((insecuritiesConfig?.insecurity_graph as {
        highlighted_curve?: string | null;
        y_axis?: string | null;
        x_axis?: string | null;
      } | null) ?? null)
    : null;
  const insecuritiesCopy = {
    "practical.label": insecuritiesSection["practical.label"] ?? null,
    "learn.eyebrow": insecuritiesSection["learn.eyebrow"] ?? null,
    "learn.body": insecuritiesSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: insecuritiesUnlocked ? (insecuritiesSection.takeaway ?? null) : null,
    "practical.teaser": insecuritiesUnlocked
      ? (insecuritiesSection["practical.teaser"] ?? null)
      : null,
    "practical.line1": insecuritiesUnlocked
      ? (insecuritiesSection["practical.line1"] ?? null)
      : null,
    "practical.line2": insecuritiesUnlocked
      ? (insecuritiesSection["practical.line2"] ?? null)
      : null,
    "practical.line3": insecuritiesUnlocked
      ? (insecuritiesSection["practical.line3"] ?? null)
      : null,
    "body.p1": insecuritiesUnlocked ? (insecuritiesSection["body.p1"] ?? null) : null,
    locked: !insecuritiesUnlocked,
  };

  // Report 2.0 Reward System ("Biochemical Reward System Dynamics") section
  // copy — a Part III, FULL_REPORT-tier PREMIUM section (section 12; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // educational slots (`edu.*`, `learn.*`) are universal and
  // always shipped, as are `stat1`/`stat1.caption` (universal-safe education).
  // The per-archetype payload — `takeaway` (verdict) and the reward config
  // (chemical order / roles / meter fills) — is the gated content: shipped
  // ONLY when the report is unlocked at the full_report tier. A locked client
  // (`rewardCopy.locked`) NEVER receives it and renders the hook teaser +
  // PremiumOverlay. Only Spiritual Lover carries full meters today; the other
  // archetypes fall back to no bars rather than fabricating. Shared viewers
  // inherit the owner's plan via `accessPlan`. Keyed to the primary archetype.
  const rewardSection = getReport2Section(contentArchetype, "reward");
  const rewardUnlocked = unlocked("biochemical_reward_system_dynamics");
  // `reward_order` is set for 3 of 14 archetypes, `reward_roles` for 2 and
  // `reward_meters` for 1, so this returned null and the section drew no rows at
  // all for 11 of 14. The per-archetype fallback in `data/report2-reward.ts` is
  // derived from each archetype's own reward prose and reproduces all three
  // existing configs exactly. Per-archetype config still wins where present.
  const rewardFallback = getRewardProfile(report2ArchetypeSlug(contentArchetype));
  const rewardConfig = rewardUnlocked
    ? (normalizeRewardConfig(
        getReport2Config(contentArchetype) as Record<string, unknown> | null
      ) ??
      (rewardFallback
        ? normalizeRewardConfig({
            reward_order: rewardFallback.order,
            reward_roles: rewardFallback.roles,
            reward_meters: rewardFallback.meters,
          })
        : null))
    : null;
  const rewardCopy = {
    "edu.eyebrow": rewardSection["edu.eyebrow"] ?? null,
    "edu.teaser": rewardSection["edu.teaser"] ?? null,
    "edu.body.p1": rewardSection["edu.body.p1"] ?? null,
    "edu.body.p2": rewardSection["edu.body.p2"] ?? null,
    "edu.body.p3": rewardSection["edu.body.p3"] ?? null,
    // Deliberate teaser, shipped to locked clients too. NOT universal: the
    // value and caption are per-archetype ("2 in 5 of Relational Nurturers"
    // vs "1 in 2 of Spark Seekers"), so never hardcode one archetype's copy
    // here. It names only the archetype the reader already sees for free, so
    // giving it away costs nothing — the paid verdict is `takeaway` below.
    // Rendered only when both parts exist (never fabricated).
    stat1: rewardSection.stat1 ?? null,
    "stat1.caption": rewardSection["stat1.caption"] ?? null,
    "learn.eyebrow": rewardSection["learn.eyebrow"] ?? null,
    "learn.body": rewardSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: rewardUnlocked ? (rewardSection.takeaway ?? null) : null,
    locked: !rewardUnlocked,
  };

  // Report 2.0 Energy & Risk ("Energy Level") section copy — a Part III,
  // FULL_REPORT-tier PREMIUM section (section 13; NOT in ESSENTIALS_SECTION_IDS,
  // so it unlocks only at the full_report tier). The educational slots (`edu.*`,
  // `chartnote1`, `learn.*`) are universal (verified: `chartnote1` is identical
  // across all 14) and always shipped. The per-archetype payload —
  // (the per-archetype hook, shown as the locked teaser) and `takeaway` (the
  // verdict) plus the energy config (readouts + highlighted curve family) — is
  // the gated content: shipped ONLY when the report is unlocked at the
  // full_report tier. A locked client (`energyCopy.locked`) receives the hook
  // teaser but null `takeaway` + null config, and renders the PremiumOverlay.
  // Only Spiritual Lover carries `energy_readouts` today; the other archetypes
  // render the curve framing WITHOUT the reader's readouts rather than
  // fabricating. Shared viewers inherit the owner's plan via `accessPlan`. Keyed
  // to the primary archetype.
  const energySection = getReport2Section(contentArchetype, "energy");
  const energyUnlocked = unlocked("energy_level");
  const energyConfig = energyUnlocked
    ? normalizeEnergyConfig(getReport2Config(contentArchetype) as Record<string, unknown> | null)
    : null;
  const energyCopy = {
    "edu.eyebrow": energySection["edu.eyebrow"] ?? null,
    "edu.teaser": energySection["edu.teaser"] ?? null,
    "edu.body.p1": energySection["edu.body.p1"] ?? null,
    "edu.body.p2": energySection["edu.body.p2"] ?? null,
    "edu.body.p3": energySection["edu.body.p3"] ?? null,
    // Universal chart caption under the wave graph.
    chartnote1: energySection.chartnote1 ?? null,
    "learn.eyebrow": energySection["learn.eyebrow"] ?? null,
    "learn.body": energySection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: energyUnlocked ? (energySection.takeaway ?? null) : null,
    locked: !energyUnlocked,
  };

  // Report 2.0 Arousal Style section copy — a Part III, FULL_REPORT-tier
  // PREMIUM section (`arousal_style`, section 21; NOT in ESSENTIALS_SECTION_IDS,
  // so it unlocks only at the full_report tier). The educational slots
  // (`eyebrow`, `insight.label`, `edu.*`, `learn.*`) are UNIVERSAL (identical
  // across all 14) and always shipped. The per-archetype payload —
  // `result` (e.g. "Responsive"), `insight.value`, the two mini-stats
  // (`stat1`/`stat1.caption`, `stat2`/`stat2.caption`) plus the arc config
  // (family + act labels) — is the gated content: shipped ONLY when unlocked at
  // the full_report tier. A locked client (`arousalCopy.locked`) receives those
  // null + null config and renders the PremiumOverlay. All 14
  // archetypes carry full arousal copy (result/insight.value/stats),
  // so nothing is fabricated. Shared viewers inherit the owner's plan via
  // `accessPlan`. Keyed to the primary archetype.
  const arousalSection = getReport2Section(contentArchetype, "arousal");
  const arousalUnlocked = unlocked("arousal_style");
  const arousalConfig = arousalUnlocked
    ? normalizeArousalConfig(getReport2Config(contentArchetype) as Record<string, unknown> | null)
    : null;
  const arousalCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    eyebrow: arousalSection.eyebrow ?? null,
    "insight.label": arousalSection["insight.label"] ?? null,
    "edu.eyebrow": arousalSection["edu.eyebrow"] ?? null,
    "edu.teaser": arousalSection["edu.teaser"] ?? null,
    "edu.body.p1": arousalSection["edu.body.p1"] ?? null,
    "edu.body.p2": arousalSection["edu.body.p2"] ?? null,
    "edu.body.p3": arousalSection["edu.body.p3"] ?? null,
    "edu.body.p4": arousalSection["edu.body.p4"] ?? null,
    "learn.eyebrow": arousalSection["learn.eyebrow"] ?? null,
    "learn.body": arousalSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    result: arousalUnlocked ? (arousalSection.result ?? null) : null,
    "insight.value": arousalUnlocked ? (arousalSection["insight.value"] ?? null) : null,
    stat1: arousalUnlocked ? (arousalSection.stat1 ?? null) : null,
    "stat1.caption": arousalUnlocked ? (arousalSection["stat1.caption"] ?? null) : null,
    stat2: arousalUnlocked ? (arousalSection.stat2 ?? null) : null,
    "stat2.caption": arousalUnlocked ? (arousalSection["stat2.caption"] ?? null) : null,
    locked: !arousalUnlocked,
  };

  // Report 2.0 Initiation Style section copy — a Part III, FULL_REPORT-tier
  // PREMIUM section (`initiation_style`, section 22; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // framing slots (`eyebrow`, `row1.label`, `practical.label`,
  // `learn.*`) are UNIVERSAL (identical across all 14) and always shipped. The
  // per-archetype payload — `result` (e.g. "Presence-led"), `row1.value`,
  // `takeaway`, `practical.teaser`, `practical.line1..3`, `body.p1`, the
  // mini-stat (`stat1`/`stat1.caption`) plus the timeline-chart config (family
  // + variant) — is the gated content: shipped ONLY when unlocked at the
  // full_report tier. A locked client (`initiationCopy.locked`) receives those
  // null + null config and renders the hook teaser + PremiumOverlay. The
  // two-column sent→received chart is family framing (drawn even locked, under
  // the blur). All 14 archetypes carry full initiation copy, so nothing is
  // fabricated. Shared viewers inherit the owner's plan. Keyed to the primary
  // archetype.
  const initiationSection = getReport2Section(contentArchetype, "initiation");
  const initiationUnlocked = unlocked("initiation_style");
  const initiationConfig = initiationUnlocked
    ? normalizeInitiationConfig(
        getReport2Config(contentArchetype) as Record<string, unknown> | null
      )
    : null;
  const initiationCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    eyebrow: initiationSection.eyebrow ?? null,
    "row1.label": initiationSection["row1.label"] ?? null,
    "practical.label": initiationSection["practical.label"] ?? null,
    "learn.eyebrow": initiationSection["learn.eyebrow"] ?? null,
    "learn.body": initiationSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    result: initiationUnlocked ? (initiationSection.result ?? null) : null,
    "row1.value": initiationUnlocked ? (initiationSection["row1.value"] ?? null) : null,
    takeaway: initiationUnlocked ? (initiationSection.takeaway ?? null) : null,
    "practical.teaser": initiationUnlocked ? (initiationSection["practical.teaser"] ?? null) : null,
    "practical.line1": initiationUnlocked ? (initiationSection["practical.line1"] ?? null) : null,
    "practical.line2": initiationUnlocked ? (initiationSection["practical.line2"] ?? null) : null,
    "practical.line3": initiationUnlocked ? (initiationSection["practical.line3"] ?? null) : null,
    "body.p1": initiationUnlocked ? (initiationSection["body.p1"] ?? null) : null,
    stat1: initiationUnlocked ? (initiationSection.stat1 ?? null) : null,
    "stat1.caption": initiationUnlocked ? (initiationSection["stat1.caption"] ?? null) : null,
    locked: !initiationUnlocked,
  };

  // Report 2.0 Libido Challenges section copy — a Part IV, FULL_REPORT-tier
  // PREMIUM section (`libido_challenges_in_relationships`, section 28; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // framing slots (`eyebrow`, `row1..4.label`, `practical.label`,
  // `learn.*`) are UNIVERSAL and always shipped. The per-archetype payload —
  // `result` (the loop name, e.g. "The Waiting Loop"), `row1..4.value`,
  // `practical.teaser`, `practical.line1..3` PLUS the loop config (name +
  // steps) — is the gated content: shipped ONLY when unlocked at the
  // full_report tier. A locked client (`libidoCopy.locked`) receives those
  // null + null loop and renders the hook teaser + PremiumOverlay. The named
  // loop renders as a cycle of `steps` connected chips; only 3 archetypes
  // carry a `loop` today (the other 11 are null → the client renders no chips
  // rather than fabricating). All 14 carry full libido copy. Shared viewers
  // inherit the owner's plan. Keyed to the primary archetype.
  const libidoSection = getReport2Section(contentArchetype, "libido");
  const libidoUnlocked = unlocked("libido_challenges_in_relationships");
  /*
   * The loop's three steps. Config `loop` only ever carried { name, steps } and
   * existed for 3 of 14 — its `name` duplicates `libido.result` and `steps` is
   * always 3 — so it gated the chips off for 11 archetypes. The frames' footer
   * says "every archetype has its own named loop, three rows and three steps",
   * so the real step text now comes from `data/report2-libido-loops.ts` (all 14)
   * and the config is no longer consulted. Still withheld when locked.
   */
  const libidoConfig = libidoUnlocked
    ? getLibidoLoopSteps(report2ArchetypeSlug(contentArchetype))
    : null;
  const libidoCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    eyebrow: libidoSection.eyebrow ?? null,
    "row1.label": libidoSection["row1.label"] ?? null,
    "row2.label": libidoSection["row2.label"] ?? null,
    "row3.label": libidoSection["row3.label"] ?? null,
    "row4.label": libidoSection["row4.label"] ?? null,
    "practical.label": libidoSection["practical.label"] ?? null,
    "learn.eyebrow": libidoSection["learn.eyebrow"] ?? null,
    "learn.body": libidoSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    result: libidoUnlocked ? (libidoSection.result ?? null) : null,
    "row1.value": libidoUnlocked ? (libidoSection["row1.value"] ?? null) : null,
    "row2.value": libidoUnlocked ? (libidoSection["row2.value"] ?? null) : null,
    "row3.value": libidoUnlocked ? (libidoSection["row3.value"] ?? null) : null,
    "row4.value": libidoUnlocked ? (libidoSection["row4.value"] ?? null) : null,
    "practical.teaser": libidoUnlocked ? (libidoSection["practical.teaser"] ?? null) : null,
    "practical.line1": libidoUnlocked ? (libidoSection["practical.line1"] ?? null) : null,
    "practical.line2": libidoUnlocked ? (libidoSection["practical.line2"] ?? null) : null,
    "practical.line3": libidoUnlocked ? (libidoSection["practical.line3"] ?? null) : null,
    locked: !libidoUnlocked,
  };

  // Report 2.0 "Challenges to Enjoy Sex" (Enjoyment) section copy — a Part IV,
  // FULL_REPORT-tier PREMIUM section
  // (`typical_challenges_to_enjoy_sex_for_the_core_archetype`, section 29; NOT
  // in ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // unlocked-report Figma anchor has no dedicated frame for it, so the client
  // renders it in the established Arousal pattern (result card + labelled rows
  // + insight + edu block). The framing slots (`eyebrow`, `row1..3.label`,
  // `insight.label`, `edu.*`, `learn.*`) are UNIVERSAL (identical across all
  // 14) and always shipped. The per-archetype payload — `result`
  // (e.g. "Wanting to Want"), `row1..3.value`, and `insight.value` — is the
  // gated content: shipped ONLY when unlocked at the full_report tier. A locked
  // client (`enjoyCopy.locked`) receives those null and renders the hook teaser
  // + PremiumOverlay. All 14 carry full enjoy copy, so nothing is fabricated.
  // Shared viewers inherit the owner's plan. Keyed to the primary archetype.
  const enjoySection = getReport2Section(contentArchetype, "enjoy");
  const enjoyUnlocked = unlocked("typical_challenges_to_enjoy_sex_for_the_core_archetype");
  const enjoyCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    eyebrow: enjoySection.eyebrow ?? null,
    "row1.label": enjoySection["row1.label"] ?? null,
    "row2.label": enjoySection["row2.label"] ?? null,
    "row3.label": enjoySection["row3.label"] ?? null,
    "insight.label": enjoySection["insight.label"] ?? null,
    "edu.eyebrow": enjoySection["edu.eyebrow"] ?? null,
    "edu.teaser": enjoySection["edu.teaser"] ?? null,
    "edu.body.p1": enjoySection["edu.body.p1"] ?? null,
    "edu.body.p2": enjoySection["edu.body.p2"] ?? null,
    "edu.body.p3": enjoySection["edu.body.p3"] ?? null,
    "learn.eyebrow": enjoySection["learn.eyebrow"] ?? null,
    "learn.body": enjoySection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    result: enjoyUnlocked ? (enjoySection.result ?? null) : null,
    "row1.value": enjoyUnlocked ? (enjoySection["row1.value"] ?? null) : null,
    "row2.value": enjoyUnlocked ? (enjoySection["row2.value"] ?? null) : null,
    "row3.value": enjoyUnlocked ? (enjoySection["row3.value"] ?? null) : null,
    "insight.value": enjoyUnlocked ? (enjoySection["insight.value"] ?? null) : null,
    locked: !enjoyUnlocked,
  };

  // Report 2.0 "Growth Potentials" section copy — a Part IV, FULL_REPORT-tier
  // PREMIUM section (`typical_growth_potentials_for_the_core_archetype`,
  // section 31; NOT in ESSENTIALS_SECTION_IDS, so it unlocks only at the
  // full_report tier). The framing slots (`learn.eyebrow`,
  // `learn.body`) are UNIVERSAL and always shipped. The per-archetype payload —
  // `takeaway`, `ladder.headline`, `rung1..5.{from,to,move}` (the growth-ladder
  // rungs; counts vary per archetype) and `ladder.close` — is the gated
  // content: shipped ONLY when unlocked at the full_report tier. A locked
  // client (`growthCopy.locked`) receives those null and renders the hook
  // teaser + PremiumOverlay. Render only rungs whose slots exist (never
  // fabricated). `growthRungs` (config `growth_rungs`) is a client-safe hint
  // for the elevation-profile step count when the rungs are withheld. All 14
  // carry full growth copy. Shared viewers inherit the owner's plan. Keyed to
  // the primary archetype.
  const growthSection = getReport2Section(contentArchetype, "growth");
  const growthUnlocked = unlocked("typical_growth_potentials_for_the_core_archetype");
  const rawGrowthRungs = getReport2Config(contentArchetype)?.growth_rungs;
  const growthRungs =
    typeof rawGrowthRungs === "number" && Number.isFinite(rawGrowthRungs) && rawGrowthRungs > 0
      ? rawGrowthRungs
      : null;
  const growthCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    "learn.eyebrow": growthSection["learn.eyebrow"] ?? null,
    "learn.body": growthSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: growthUnlocked ? (growthSection.takeaway ?? null) : null,
    "ladder.headline": growthUnlocked ? (growthSection["ladder.headline"] ?? null) : null,
    ...Object.fromEntries(
      [1, 2, 3, 4, 5].flatMap((i) =>
        (["from", "to", "move"] as const).map((slot) => [
          `rung${i}.${slot}`,
          growthUnlocked ? (growthSection[`rung${i}.${slot}`] ?? null) : null,
        ])
      )
    ),
    "ladder.close": growthUnlocked ? (growthSection["ladder.close"] ?? null) : null,
    locked: !growthUnlocked,
  };

  // Report 2.0 "Reading Recommendations" section copy — a Part IV,
  // FULL_REPORT-tier PREMIUM section (`recommendations`, section 32; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // framing slots (universal category tags `book1..4.tag`,
  // `closing.lead`, `learn.eyebrow`, `learn.body`) are UNIVERSAL and always
  // shipped. The per-archetype payload — each book's `title` / `author` /
  // `blurb` plus `closing.formula` — is the gated content: shipped ONLY when
  // unlocked at the full_report tier. A locked client (`readingCopy.locked`)
  // receives those null and renders the hook teaser + PremiumOverlay. Render
  // only the books whose title exists (counts vary; never fabricated). All 14
  // carry full reading copy. Shared viewers inherit the owner's plan. Keyed to
  // the primary archetype.
  const readingSection = getReport2Section(contentArchetype, "reading");
  const readingUnlocked = unlocked("recommendations");
  const readingCopy = {
    // Universal — always shipped (frame the section for locked clients too).
    "closing.lead": readingSection["closing.lead"] ?? null,
    "learn.eyebrow": readingSection["learn.eyebrow"] ?? null,
    "learn.body": readingSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients (tag is universal, kept).
    ...Object.fromEntries(
      [1, 2, 3, 4].flatMap((i) => [
        [`book${i}.tag`, readingSection[`book${i}.tag`] ?? null],
        [`book${i}.title`, readingUnlocked ? (readingSection[`book${i}.title`] ?? null) : null],
        [`book${i}.author`, readingUnlocked ? (readingSection[`book${i}.author`] ?? null) : null],
        [`book${i}.blurb`, readingUnlocked ? (readingSection[`book${i}.blurb`] ?? null) : null],
      ])
    ),
    "closing.formula": readingUnlocked ? (readingSection["closing.formula"] ?? null) : null,
    locked: !readingUnlocked,
  };

  // Report 2.0 Power Orientation section copy — a Part III, FULL_REPORT-tier
  // PREMIUM section (`power_orientation`, section 15; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // educational slots (`edu.*`, `learn.*`) are always shipped. The per-archetype
  // payload — `takeaway` (verdict), `body.p1` (the reader's own read on the
  // map) and `zone` (the reader's power-zone region label, which drives the
  // top label + the highlighted "You" zone + dot on the plane) — is the gated
  // content: shipped ONLY when the report is unlocked at the full_report tier.
  // A locked client (`powerCopy.locked`) receives null takeaway/body/zone and
  // renders the hook teaser + PremiumOverlay; the 14-dot plane itself is a
  // fixed universal layout and still draws, but without the "You"/zone
  // highlight. `zone` derives from config `families.power_zone` (the only
  // per-archetype power datum today — no per-archetype dot positions exist, so
  // the plane layout is hardcoded client-side from the Figma). Shared viewers
  // inherit the owner's plan via `accessPlan`. Keyed to the primary archetype.
  const powerSection = getReport2Section(contentArchetype, "power");
  const powerUnlocked = unlocked("power_orientation");
  const powerZoneInfo = powerUnlocked
    ? getPowerZone(getReport2Config(contentArchetype)?.families?.power_zone)
    : null;
  const powerCopy = {
    "edu.eyebrow": powerSection["edu.eyebrow"] ?? null,
    "edu.teaser": powerSection["edu.teaser"] ?? null,
    "edu.body.p1": powerSection["edu.body.p1"] ?? null,
    "edu.body.p2": powerSection["edu.body.p2"] ?? null,
    "edu.body.p3": powerSection["edu.body.p3"] ?? null,
    "edu.body.p4": powerSection["edu.body.p4"] ?? null,
    "learn.eyebrow": powerSection["learn.eyebrow"] ?? null,
    "learn.body": powerSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: powerUnlocked ? (powerSection.takeaway ?? null) : null,
    "body.p1": powerUnlocked ? (powerSection["body.p1"] ?? null) : null,
    zone: powerZoneInfo?.label ?? null,
    "zone.result": powerZoneInfo?.result ?? null,
    locked: !powerUnlocked,
  };

  // Report 2.0 Curiosity & Relationship Form section copy — a Part III,
  // FULL_REPORT-tier PREMIUM section (`curiosity_level`, section 16; NOT in
  // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
  // universal slots — `edu.*` (incl. the 14-item `edu.struct.N`
  // list of relationship structures) and `learn.*` — are always shipped. The
  // per-archetype payload — `takeaway` (the italic pull-quote), `body.p1` (the
  // bold intro read) and `body.p2/p3` — is the gated content: shipped ONLY when
  // unlocked. The reader's fit across relationship forms comes from config
  // `relationship_fit` (structure → 0..3 score); only Spiritual Lover carries
  // one in config, so the other 13 fall back to `data/report2-relationship-fit.ts`
  // (read off each archetype's own curiosity copy; the Spiritual Lover entry
  // reproduces the real config exactly) — without it 13 of 14 drew a fit table
  // with no segments. Withheld from a locked client. Shared viewers inherit the
  // owner's plan via `accessPlan`. Keyed to the primary archetype.
  const curiositySection = getReport2Section(contentArchetype, "curiosity");
  const curiosityUnlocked = unlocked("curiosity_level");
  const rawFit =
    getReport2Config(contentArchetype)?.relationship_fit ??
    getRelationshipFit(report2ArchetypeSlug(contentArchetype));
  const relationshipFit =
    curiosityUnlocked && rawFit && typeof rawFit === "object"
      ? (rawFit as Record<string, number>)
      : null;
  const curiosityCopy = {
    "edu.eyebrow": curiositySection["edu.eyebrow"] ?? null,
    "edu.teaser": curiositySection["edu.teaser"] ?? null,
    "edu.body.p1": curiositySection["edu.body.p1"] ?? null,
    "edu.body.p2": curiositySection["edu.body.p2"] ?? null,
    // Universal 14-item list of relationship structures (edu.struct.1..14).
    ...Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [
        `edu.struct.${i + 1}`,
        curiositySection[`edu.struct.${i + 1}`] ?? null,
      ])
    ),
    "learn.eyebrow": curiositySection["learn.eyebrow"] ?? null,
    "learn.body": curiositySection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    takeaway: curiosityUnlocked ? (curiositySection.takeaway ?? null) : null,
    "body.p1": curiosityUnlocked ? (curiositySection["body.p1"] ?? null) : null,
    "body.p2": curiosityUnlocked ? (curiositySection["body.p2"] ?? null) : null,
    "body.p3": curiosityUnlocked ? (curiositySection["body.p3"] ?? null) : null,
    locked: !curiosityUnlocked,
  };

  // Report 2.0 Love Language section copy — a Part III, FULL_REPORT-tier
  // PREMIUM section (`love_language`, section 19; NOT in ESSENTIALS_SECTION_IDS,
  // so it unlocks only at the full_report tier). The universal slots —
  // `edu.*` and `learn.*` — are always shipped. The per-archetype
  // payload — `body.p1` (the "catch" line) plus the reader's ranked ordering of
  // the five languages (config `love_language_order`) — is the gated content:
  // shipped ONLY when unlocked. The five languages themselves are universal
  // (same five, only the ORDER varies); only some archetypes carry an order
  // (e.g. Spiritual Lover), so an archetype without one renders the framing +
  // edu WITHOUT the ranked list rather than fabricating. Also withheld from a
  // locked client. Shared viewers inherit the owner's plan via `accessPlan`.
  // Keyed to the primary archetype.
  const lovelangSection = getReport2Section(contentArchetype, "lovelang");
  const lovelangUnlocked = unlocked("love_language");
  // Config carries `love_language_order` for Spiritual Lover only, so the other
  // 13 fall back to `data/report2-love-languages.ts` (each order read off that
  // archetype's own lovelang copy; the Spiritual Lover entry reproduces the real
  // config exactly). Without it 13 of 14 rendered NO ranked list at all.
  const rawLoveOrder =
    getReport2Config(contentArchetype)?.love_language_order ??
    getLoveLanguageOrder(report2ArchetypeSlug(contentArchetype));
  const loveLanguageOrder =
    lovelangUnlocked && Array.isArray(rawLoveOrder)
      ? rawLoveOrder.filter((v): v is string => typeof v === "string")
      : null;
  const lovelangCopy = {
    "edu.eyebrow": lovelangSection["edu.eyebrow"] ?? null,
    "edu.teaser": lovelangSection["edu.teaser"] ?? null,
    "edu.body.p1": lovelangSection["edu.body.p1"] ?? null,
    "edu.body.p2": lovelangSection["edu.body.p2"] ?? null,
    "edu.body.p3": lovelangSection["edu.body.p3"] ?? null,
    "learn.eyebrow": lovelangSection["learn.eyebrow"] ?? null,
    "learn.body": lovelangSection["learn.body"] ?? null,
    // Per-archetype — withheld from locked clients.
    "body.p1": lovelangUnlocked ? (lovelangSection["body.p1"] ?? null) : null,
    locked: !lovelangUnlocked,
  };

  // Report 2.0 Confidence Level section copy — a Part II, essentials-tier
  // PREMIUM section (section 10). UNLIKE the other Part II sections, EVERY copy
  // slot here is universal education (`edu.*`, `chartnote1`,
  // `learn.*`) — always shipped. The per-archetype specificity is the confidence
  // RESULT, which lives in config `confidence_strip` = { you_dot_x, result_word }
  // — that is the gated bit: shipped ONLY when the report is unlocked at the
  // essentials tier (or above). A locked client receives `confidenceStrip: null`
  // and renders the universal strip framing + a blurred stand-in + overlay.
  // Only Spiritual Lover carries a real `confidence_strip` today; the other 13
  // are null, so even unlocked they render the strip WITHOUT the reader's dot/
  // result (never fabricated). Keyed to the primary archetype.
  const confidenceSection = getReport2Section(contentArchetype, "confidence");
  const confidenceUnlocked = unlocked("confidence_level");
  const confidenceStripCfg = getReport2Config(contentArchetype)?.confidence_strip as
    | {
        you_dot_x?: number | null;
        result_word?: string | null;
      }
    | null
    | undefined;
  const confidenceStrip =
    confidenceUnlocked && confidenceStripCfg?.result_word
      ? {
          you_dot_x: confidenceStripCfg.you_dot_x ?? null,
          result_word: confidenceStripCfg.result_word,
        }
      : null;
  const confidenceCopy = {
    "edu.eyebrow": confidenceSection["edu.eyebrow"] ?? null,
    "edu.teaser": confidenceSection["edu.teaser"] ?? null,
    "edu.body.p1": confidenceSection["edu.body.p1"] ?? null,
    "edu.body.p2": confidenceSection["edu.body.p2"] ?? null,
    chartnote1: confidenceSection.chartnote1 ?? null,
    "learn.eyebrow": confidenceSection["learn.eyebrow"] ?? null,
    "learn.body": confidenceSection["learn.body"] ?? null,
    locked: !confidenceUnlocked,
  };

  return {
    attachmentCopy,
    attachmentFamily,
    attachmentPlane,
    insecuritiesCopy,
    insecurityCueFamily,
    insecurityGraph,
    rewardCopy,
    rewardConfig,
    energyCopy,
    energyConfig,
    arousalCopy,
    arousalConfig,
    initiationCopy,
    initiationConfig,
    libidoCopy,
    libidoConfig,
    enjoyCopy,
    growthCopy,
    growthRungs,
    readingCopy,
    powerCopy,
    curiosityCopy,
    relationshipFit,
    lovelangCopy,
    loveLanguageOrder,
    confidenceCopy,
    confidenceStrip,
  };
}
