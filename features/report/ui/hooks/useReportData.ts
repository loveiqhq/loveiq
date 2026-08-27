"use client";

import { useEffect, useState } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";
import {
  finalizeReportSession,
  getReportPricingSessionId,
} from "@features/survey/ui/hooks/surveySession";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";

export interface ReportPracticeTendencyRowData {
  practice: string;
  // Server nulls these on locked rows past index 0 — names tease, numbers stay
  // server-stripped. See `lib/report/contentGating.ts`.
  fantasyPull: number | null;
  actualPleasure: number | null;
  description: string | null;
}

export interface ReportPracticeTendencyGroupForUser {
  title: string;
  rows: ReportPracticeTendencyRowData[];
  totalRowCount: number;
}

export interface ReportPracticeTendencyContentForUser {
  introBlocks: string[];
  groups: ReportPracticeTendencyGroupForUser[];
}

export interface ReportData {
  /** Numeric survey_submission.id — used to attach analytics_event rows. */
  submissionId?: number | null;
  accessPlan: "essentials" | "full_report" | "core" | "all_reports" | null;
  /** When false, the forced/non-dismissible paywall is paused (report freely viewable). */
  forcedPaywallEnabled?: boolean;
  userName: string | null;
  userEmail: string | null;
  ownerFirstName?: string | null;
  ownerToken?: string | null;
  viewMode?: "owner" | "shared";
  primaryArchetype: string;
  percentages: Record<string, number>;
  reportDate: string;
  diagnostics: Record<string, unknown> | null;
  snapshotAnswers: {
    currentSexualSatisfaction: number | null;
    importanceOfSex: number | null;
  } | null;
  pricingQuotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
  unlockedArchetypes: string[];
  /**
   * Per-archetype tier the user holds: `{ "Sage": "essentials", "Lover":
   * "full_report" }`. Drives `isSectionUnlockedForPlan` so a user who bought
   * Essentials for Sage but Full Report for Lover sees the right gate on each.
   */
  archetypeTiers: Record<string, "essentials" | "full_report">;
  /**
   * Archetype prose, server-filtered to only include (blockId, archetypeName)
   * pairs the user has paid access to. The previous design imported the whole
   * static map into the client bundle — anyone could read every archetype's
   * premium copy via DevTools regardless of their plan.
   */
  archetypeContent: Record<string, Record<string, string>>;
  /**
   * Practice tendency content, server-filtered. When the practice section is
   * locked we ship only the free-preview row plus the total row count so the
   * locked-state placeholders render correctly without leaking premium scores.
   */
  practiceTendencies: Record<string, ReportPracticeTendencyContentForUser>;
  /**
   * Report 2.0 Snapshot section copy for the primary archetype, resolved
   * server-side (the 634KB copy module is server-only). Null-valued slots for
   * archetypes without a snapshot copy block. Threaded to `SnapshotSection`.
   */
  snapshotCopy: import("../sections/SnapshotSection").SnapshotCopy | null;
  /**
   * Report 2.0 Findings section copy for the primary archetype, resolved
   * server-side and locked-aware: for a user without a paid plan, f3-5 carry
   * ONLY the universal `.locked.` teaser text (`locked: true`). Threaded to
   * `FindingsSection`.
   */
  findingsCopy: import("../sections/FindingsSection").FindingsCopy | null;
  /**
   * Report 2.0 Beliefs ("Typical Beliefs") copy for the primary archetype,
   * resolved server-side and locked-aware. Educational slots are universal; the
   * per-archetype keep/loosen/body payload is only present when unlocked at the
   * essentials tier (`locked: false`). Threaded to `BeliefsSection`.
   */
  beliefsCopy: import("../sections/BeliefsSection").BeliefsCopy | null;
  /**
   * Report 2.0 Attachment Style copy for the primary archetype, resolved
   * server-side and locked-aware. Universal slots (gate.hook, eyebrow, edu.*,
   * learn.*) are always present; the per-archetype result/row-values/insight/
   * body/plane are only present when unlocked at the essentials tier
   * (`locked: false`). Threaded to `AttachmentPatternsSection`.
   */
  attachmentCopy: import("../sections/AttachmentPatternsSection").AttachmentCopy | null;
  /** Attachment family (secure-anxious | secure-avoidant | avoidant) — drives row labels. */
  attachmentFamily: string | null;
  /** Normalized attachment-plane geometry; null for archetypes without real coords. */
  attachmentPlane: import("../sections/AttachmentPatternsSection").AttachmentPlane | null;
  /**
   * Report 2.0 Accelerators & Brakes copy for the primary archetype, resolved
   * server-side and locked-aware. Educational slots (gate.hook, edu.*, learn.*)
   * are universal; the per-archetype `takeaway` verdict is only present when
   * unlocked at the essentials tier (`locked: false`). Threaded to
   * `AcceleratorsSection`.
   */
  accelCopy: import("../sections/AcceleratorsSection").AccelCopy | null;
  /**
   * Report 2.0 Core Insecurities copy for the primary archetype, resolved
   * server-side and locked-aware. Universal slots (gate.hook, practical.label,
   * learn.*) are always present; the per-archetype takeaway/practical-lines/
   * body are only present when unlocked at the essentials tier
   * (`locked: false`). Threaded to `InsecuritiesSection`.
   */
  insecuritiesCopy: import("../sections/InsecuritiesSection").InsecuritiesCopy | null;
  /** Insecurity cue family (absence | abandonment | evaluation | engulfment | depletion | destabilisation) — drives the cue graph. Null when locked/unknown. */
  insecurityCueFamily: string | null;
  /** Config `insecurity_graph` (highlighted curve + axis overrides); null when locked/absent. */
  insecurityGraph: import("../sections/InsecuritiesSection").InsecurityGraph | null;
  /**
   * Report 2.0 Reward System copy for the primary archetype, resolved
   * server-side. Educational slots + stat are universal; `takeaway` is withheld
   * when locked (`locked: true`). Threaded to `RewardSection`.
   */
  rewardCopy: import("../sections/RewardSection").RewardCopy | null;
  /** Reward config (chemical order/roles/meters); null when locked or absent for the archetype. */
  rewardConfig: import("../sections/RewardSection").RewardConfig | null;
  /**
   * Report 2.0 Energy & Risk copy for the primary archetype, resolved
   * server-side. Educational slots + chartnote are universal; `gate.hook` and
   * `takeaway` are withheld when locked (`locked: true`). Threaded to
   * `EnergySection`.
   */
  energyCopy: import("../sections/EnergySection").EnergyCopy | null;
  /** Energy config (curve family + readout levels); null when locked or absent for the archetype. */
  energyConfig: import("../sections/EnergySection").EnergyConfig | null;
  /**
   * Report 2.0 Arousal Style copy for the primary archetype, resolved
   * server-side. Universal slots (eyebrow, insight.label, edu.*, learn.*) are
   * always shipped; `gate.hook`, `result`, `insight.value`, and the two
   * mini-stats are withheld when locked (`locked: true`). Threaded to
   * `ArousalSection`.
   */
  arousalCopy: import("../sections/ArousalSection").ArousalCopy | null;
  /** Arc config (family + phase-label acts); null when locked or absent for the archetype. */
  arousalConfig: import("../sections/ArousalSection").ArousalConfig | null;
  /**
   * Report 2.0 Initiation Style copy for the primary archetype, resolved
   * server-side. Framing slots (`gate.hook`, `eyebrow`, `row1.label`,
   * `practical.label`, `learn.*`) are universal; the per-archetype
   * result/values/copy/mini-stat are withheld (null) for locked clients. See
   * `InitiationSection`.
   */
  initiationCopy: import("../sections/InitiationSection").InitiationCopy | null;
  /** Timeline-chart config (family + variant); null when locked or absent for the archetype. */
  initiationConfig: import("../sections/InitiationSection").InitiationConfig | null;
  /**
   * Report 2.0 Libido Challenges copy for the primary archetype, resolved
   * server-side. Framing slots (`gate.hook`, `eyebrow`, `row1..4.label`,
   * `practical.label`, `learn.*`) are universal; the per-archetype
   * result/row-values/practical copy are withheld (null) for locked clients.
   * See `LibidoSection`.
   */
  libidoCopy: import("../sections/LibidoSection").LibidoCopy | null;
  /** Named-loop config (name + steps); null when locked or absent for the archetype. */
  libidoConfig: import("../sections/LibidoSection").LibidoConfig | null;
  /**
   * Report 2.0 "Challenges in Partnership" copy for the primary archetype,
   * resolved server-side. Universal framing (`gate.hook`, `eyebrow`,
   * `row1..3.label`, `edu.*`, `learn.*`) always present; per-archetype `result`
   * + `row1..3.value` withheld (null) when locked. See `PartnershipSection`.
   */
  partnershipCopy: import("../sections/PartnershipSection").PartnershipCopy | null;
  partnershipLoop: import("@/data/report2-partnership-loops").PartnershipLoop | null;
  /**
   * Report 2.0 "Challenges to Enjoy Sex" (Enjoyment) copy for the primary
   * archetype, resolved server-side. Universal framing (`eyebrow`,
   * `row1..3.label`, `insight.label`, `edu.*`, `learn.*`) always present;
   * per-archetype `gate.hook`, `result`, `row1..3.value`, `insight.value`
   * withheld (null) when locked. See `EnjoymentSection`.
   */
  enjoyCopy: import("../sections/EnjoymentSection").EnjoyCopy | null;
  /**
   * Report 2.0 "Growth Potentials" copy for the primary archetype, resolved
   * server-side. Universal framing (`gate.hook`, `learn.*`) always present;
   * per-archetype `takeaway`, `ladder.headline`, `rung1..5.{from,to,move}`,
   * `ladder.close` withheld (null) when locked. See `GrowthSection`.
   */
  growthCopy: import("../sections/GrowthSection").GrowthCopy | null;
  /** `growth_rungs` config hint (elevation-profile step count); null if absent. */
  growthRungs: number | null;
  /**
   * Report 2.0 Reading Recommendations copy for the primary archetype, resolved
   * server-side. Universal gate.hook/book*.tag/closing.lead/learn.* always
   * shipped; per-archetype book*.title/author/blurb + closing.formula withheld
   * (null) when locked. See `ReadingSection`.
   */
  readingCopy: import("../sections/ReadingSection").ReadingCopy | null;
  /**
   * Report 2.0 Power Orientation copy for the primary archetype, resolved
   * server-side. Educational slots (`gate.hook`, `edu.*`, `learn.*`) are
   * universal; `takeaway`, `body.p1`, and `zone` (the reader's power-zone +
   * "You" highlight) are per-archetype and withheld when `locked`.
   */
  powerCopy: import("../sections/PowerSection").PowerCopy | null;
  /**
   * Report 2.0 Fantasy ("Fantasy vs. Reality") copy for the primary archetype,
   * resolved server-side. EVERY slot is universal (hook, edu.*, the two
   * chart-notes, learn.*), so all are always shipped; `locked` only drives
   * whether the client blurs the fantasy map behind the overlay. No per-user
   * fantasy dot data exists — the map draws the Figma's representative layout.
   */
  fantasyCopy: import("../sections/FantasySection").FantasyCopy | null;
  fantasyDots: import("@features/report/server/fantasyMap").FantasyMapDot[] | null;
  /**
   * Report 2.0 Curiosity & Relationship Form copy for the primary archetype,
   * resolved server-side. Universal slots (`gate.hook`, `edu.*` incl. the
   * `edu.struct.N` structure list, `learn.*`) are always present; `takeaway` and
   * `body.p1/p2/p3` are per-archetype and withheld when `locked`. Threaded to
   * `CuriositySection`.
   */
  curiosityCopy: import("../sections/CuriositySection").CuriosityCopy | null;
  /**
   * The pre-defined style the reader's archetype is, in each of the three
   * chapters whose source document carries an "across the archetypes" list:
   * curiosity level (16), arousal style (21), initiation style (22). Resolved
   * and gated server-side; null when that chapter is locked or when the
   * document names no style for the archetype. See `data/report2-doc-styles.ts`.
   */
  curiosityStyles:
    | (import("@/data/report2-doc-styles").Report2DocStyle &
        import("@/data/report2-doc-styles").Report2StyleMatch)[]
    | null;
  arousalStyles:
    | (import("@/data/report2-doc-styles").Report2DocStyle &
        import("@/data/report2-doc-styles").Report2StyleMatch)[]
    | null;
  initiationStyles:
    | (import("@/data/report2-doc-styles").Report2DocStyle &
        import("@/data/report2-doc-styles").Report2StyleMatch)[]
    | null;
  /**
   * The closing "Summary" chapter — chapter 3 of the source document, one entry
   * per paragraph. Per-archetype, so null when Part IV is locked or when the
   * document has no chapter 3 for the archetype.
   */
  archetypeSummary: string[] | null;
  /** Key Concepts for the three chapters that carry no other copy of their own. */
  importanceLearn: import("../sections/LearnPill").LearnPillCopy | null;
  constellationLearn: import("../sections/LearnPill").LearnPillCopy | null;
  knowhowLearn: import("../sections/LearnPill").LearnPillCopy | null;
  /** Config `relationship_fit` (structure → 0..3 fit score); null when locked or when the archetype has no fit map (only Spiritual Lover today). */
  relationshipFit: Record<string, number> | null;
  /** Report 2.0 Love Language copy for the primary archetype, resolved server-side; `locked` mirrors the full_report gate. */
  lovelangCopy: import("../sections/LoveLanguageSection").LoveLanguageCopy | null;
  /** Config `love_language_order` (five language slugs in rank order); null when locked or when the archetype has no order. */
  loveLanguageOrder: string[] | null;
  /**
   * Report 2.0 Confidence Level copy for the primary archetype, resolved
   * server-side. All copy slots are universal education; `locked` mirrors the
   * essentials unlock. Threaded to `ConfidenceSection`.
   */
  confidenceCopy: import("../sections/ConfidenceSection").ConfidenceCopy | null;
  /** Config `confidence_strip` (per-archetype result word + dot); null when locked or when the archetype has no strip (only Spiritual Lover today). */
  confidenceStrip: import("../sections/ConfidenceSection").ConfidenceStrip | null;
  /**
   * Report 2.0 Insight Map section copy for the primary archetype, resolved
   * server-side. Only the per-archetype sublines + featured title/sub; the tile
   * labels are universal and hardcoded in `InsightMapSection`. Threaded to
   * `InsightMapSection`.
   */
  mapCopy: import("../sections/InsightMapSection").MapCopy | null;
  /**
   * Report 2.0 Sexual Stage card copy for the primary archetype, resolved
   * server-side. Labels are universal; `result` + row/practical values are
   * per-archetype. Threaded to `SexualStageSection`.
   */
  stageCopy: import("../sections/SexualStageSection").StageCopy | null;
  /**
   * Report 2.0 Constellation ("Other Archetypes") mottos, keyed by archetype
   * name — every one of the 14, resolved server-side. The section lists all
   * archetypes ranked by match %, each showing its own motto. Threaded to
   * `ConstellationSection`. A null value means that archetype has no motto copy.
   */
  constellationMottos: Record<string, string | null>;
}

export interface ReportRequestError {
  statusCode: number | null;
  message: string | null;
}

export interface ShareVerificationChallenge {
  recipientEmailHint: string | null;
  ownerFirstName: string | null;
}

type Status = "idle" | "loading" | "error" | "success" | "missing" | "needs_verification";

interface ReportIdentifier {
  sessionId?: string | null;
  token?: string | null;
  /**
   * Optional override for the pricing session id — threaded from the offer
   * email CTA (?pricingSessionId=...). When provided it takes precedence over
   * the per-report session id read from local storage so the recipient lands
   * on exactly the locked quote the email was built against.
   */
  pricingSessionIdOverride?: string | null;
}

async function parseErrorResponse(res: Response): Promise<ReportRequestError> {
  try {
    const json = (await res.json()) as { error?: unknown };
    return {
      statusCode: res.status,
      message: typeof json.error === "string" ? json.error : null,
    };
  } catch {
    return {
      statusCode: res.status,
      message: null,
    };
  }
}

export function useReportData(identifier: ReportIdentifier) {
  const { sessionId, token, pricingSessionIdOverride } = identifier;
  const hasIdentifier = !!(sessionId || token);

  const [state, setState] = useState<{
    data: ReportData | null;
    status: Status;
    error: ReportRequestError | null;
    challenge: ShareVerificationChallenge | null;
    refreshKey: number;
  }>({
    data: null,
    status: "idle",
    error: null,
    challenge: null,
    refreshKey: 0,
  });

  useEffect(() => {
    if (!hasIdentifier) return;

    let cancelled = false;

    async function fetchReport() {
      setState((prev) => ({
        ...prev,
        data: null,
        status: "loading",
        error: null,
        challenge: null,
      }));

      try {
        const csrfToken = getCsrfToken();
        const params = new URLSearchParams(token ? { token } : { sessionId: sessionId ?? "" });
        const pricingSessionId =
          pricingSessionIdOverride ?? getReportPricingSessionId({ sessionId, token });
        if (pricingSessionId) {
          params.set("pricingSessionId", pricingSessionId);
        }
        /*
         * Forward the staging-only `?preview_archetype=` from the page URL so the
         * API resolves the report's chapters for that archetype. Read off
         * `window.location` rather than threaded through as a prop because it is a
         * review affordance, not part of the report's own state — and the API
         * ignores it outright on production, so forwarding it is always safe. See
         * `resolvePreviewArchetype` in app/api/report/route.ts.
         */
        if (typeof window !== "undefined") {
          const previewArchetype = new URLSearchParams(window.location.search).get(
            "preview_archetype"
          );
          if (previewArchetype) {
            params.set("preview_archetype", previewArchetype);
          }
        }

        const res = await fetch(`/api/report?${params.toString()}`, {
          headers: { "x-csrf-token": csrfToken },
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          // Shared-report viewer hasn't passed the email-verification gate yet.
          try {
            const json = (await res.json()) as {
              needsVerification?: boolean;
              recipientEmailHint?: string | null;
              ownerFirstName?: string | null;
            };
            if (json.needsVerification) {
              setState((prev) => ({
                data: null,
                status: "needs_verification",
                error: null,
                challenge: {
                  recipientEmailHint: json.recipientEmailHint ?? null,
                  ownerFirstName: json.ownerFirstName ?? null,
                },
                refreshKey: prev.refreshKey,
              }));
              return;
            }
          } catch {
            // Fall through to generic error handling below.
          }
        }

        if (!res.ok) {
          const error = await parseErrorResponse(res);
          setState((prev) => ({
            ...prev,
            data: null,
            status: "error",
            error,
            challenge: null,
          }));
          return;
        }

        const json = (await res.json()) as ReportData;
        if (sessionId) finalizeReportSession(sessionId);
        setState((prev) => ({
          ...prev,
          data: json,
          status: "success",
          error: null,
          challenge: null,
        }));
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            data: null,
            status: "error",
            error: { statusCode: null, message: null },
            challenge: null,
          }));
        }
      }
    }

    void fetchReport();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token, hasIdentifier, pricingSessionIdOverride, state.refreshKey]);

  const retry = () => setState((prev) => ({ ...prev, refreshKey: prev.refreshKey + 1 }));

  if (!hasIdentifier) {
    return {
      data: null,
      status: "missing" as const,
      error: null,
      challenge: null,
      retry,
    };
  }

  if (state.status === "idle") {
    return {
      data: null,
      status: "loading" as const,
      error: null,
      challenge: null,
      retry,
    };
  }

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    challenge: state.challenge,
    retry,
  };
}
