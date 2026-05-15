import { buildChannelEfficiencySnapshot } from "@features/admin/server/channel-efficiency";
import { buildCreativeIntelligenceSnapshot } from "@features/admin/server/creative-intelligence";
import { round1 } from "@features/admin/server/next-level";
import { buildStrategySnapshot } from "@features/admin/server/strategy";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

interface ReferralRpcResult {
  total_invites: number;
  unique_referrers: number;
  completions_from_invites: number;
  viral_coefficient: number;
}

export async function buildGrowthControlTowerSnapshot(inputDays: number) {
  const [channelEfficiency, creativeIntelligence, strategySnapshot, referralRes] =
    await Promise.all([
      buildChannelEfficiencySnapshot(inputDays),
      buildCreativeIntelligenceSnapshot(inputDays),
      buildStrategySnapshot(inputDays),
      supabaseFetch("/rest/v1/rpc/get_referral_chains", {
        method: "POST",
        body: JSON.stringify({
          since_ts: new Date(Date.now() - Math.max(inputDays || 30, 7) * 86_400_000).toISOString(),
        }),
      }),
    ]);

  let referrals: ReferralRpcResult = {
    total_invites: 0,
    unique_referrers: 0,
    completions_from_invites: 0,
    viral_coefficient: 0,
  };

  if (referralRes.ok) {
    referrals = (await referralRes.json()) as ReferralRpcResult;
  } else {
    logger.warn(
      { status: referralRes.status },
      "Referral chains unavailable for growth control tower"
    );
  }

  const totalStarts = channelEfficiency.summary.totalStarts;
  const totalSignups = channelEfficiency.summary.totalSignups;
  const overallCompletionRate =
    totalStarts > 0
      ? round1(
          (channelEfficiency.channels.reduce(
            (sum, channel) => sum + (channel.completionRate / 100) * channel.starts,
            0
          ) /
            totalStarts) *
            100
        )
      : 0;
  const overallPaidRate =
    totalStarts > 0
      ? round1(
          (channelEfficiency.channels.reduce(
            (sum, channel) => sum + (channel.paidRate / 100) * channel.starts,
            0
          ) /
            totalStarts) *
            100
        )
      : 0;
  const overallRecoveryRate =
    channelEfficiency.summary.totalPartialSaves > 0
      ? round1(
          (channelEfficiency.channels.reduce(
            (sum, channel) =>
              sum + (channel.recoveryRate / 100) * (channel.starts > 0 ? channel.starts : 0),
            0
          ) /
            totalStarts) *
            100
        )
      : 0;

  const topChannel = channelEfficiency.channels[0] ?? null;
  const weakHighVolumeChannel =
    channelEfficiency.channels
      .filter((channel) => channel.action === "fix")
      .sort((a, b) => b.starts - a.starts)[0] ?? null;
  const blindspotCreative = creativeIntelligence.creatives.find(
    (creative) => creative.attention === "blindspot"
  );
  const scaleCreative = creativeIntelligence.creatives.find(
    (creative) => creative.attention === "scale"
  );
  const largestLeak = strategySnapshot.opportunities.funnelLeakage[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    days: channelEfficiency.days,
    summary: {
      waitlistSignups: totalSignups,
      surveyStarts: totalStarts,
      completionRate: overallCompletionRate,
      paidRate: overallPaidRate,
      viralCoefficient: round1(referrals.viral_coefficient ?? 0),
      recoveryRate: overallRecoveryRate,
      scaleChannels: channelEfficiency.summary.scaleCandidates,
      blindspotStarts: creativeIntelligence.summary.blindspotStarts,
    },
    funnel: [
      { name: "Waitlist", count: totalSignups },
      { name: "Starts", count: totalStarts },
      {
        name: "Completed",
        count: Math.round(
          channelEfficiency.channels.reduce(
            (sum, channel) => sum + (channel.completionRate / 100) * channel.starts,
            0
          )
        ),
      },
      {
        name: "Viewed Report",
        count: Math.round(
          channelEfficiency.channels.reduce(
            (sum, channel) => sum + (channel.reportViewRate / 100) * channel.starts,
            0
          )
        ),
      },
      {
        name: "Paid",
        count: Math.round(
          channelEfficiency.channels.reduce(
            (sum, channel) => sum + (channel.paidRate / 100) * channel.starts,
            0
          )
        ),
      },
    ],
    priorities: [
      largestLeak
        ? {
            title: `Fix leak: ${largestLeak.from} -> ${largestLeak.to}`,
            detail: `${largestLeak.lossCount} users are leaking here at ${largestLeak.lossRate}% loss.`,
            tone: "risk" as const,
            href: largestLeak.href,
          }
        : {
            title: "No dominant funnel leak",
            detail: "No single leak dominates the current funnel window.",
            tone: "watch" as const,
            href: "/admin/funnels",
          },
      topChannel
        ? {
            title: `Scale channel: ${topChannel.source}`,
            detail: `${topChannel.efficiencyScore} efficiency score, ${topChannel.paidRate}% paid rate, $${topChannel.revenuePerStart} revenue per start.`,
            tone: topChannel.action === "scale" ? ("good" as const) : ("watch" as const),
            href: "/admin/growth",
          }
        : {
            title: "No scale-ready channel",
            detail: "No source currently clears the efficiency threshold with meaningful volume.",
            tone: "watch" as const,
            href: "/admin/growth",
          },
      weakHighVolumeChannel
        ? {
            title: `Repair source: ${weakHighVolumeChannel.source}`,
            detail: `${weakHighVolumeChannel.starts} starts are flowing through a weak source with only ${weakHighVolumeChannel.completionRate}% completion.`,
            tone: "risk" as const,
            href: "/admin/growth",
          }
        : {
            title: "No urgent high-volume source failure",
            detail:
              "No tracked source is combining meaningful volume with clearly weak downstream efficiency.",
            tone: "watch" as const,
            href: "/admin/growth",
          },
      blindspotCreative
        ? {
            title: "Close creative blindspots",
            detail: `${blindspotCreative.source} is still delivering starts without reliable campaign/content labeling.`,
            tone: "watch" as const,
            href: "/admin/growth",
          }
        : scaleCreative
          ? {
              title: `Promote creative: ${scaleCreative.content}`,
              detail: `${scaleCreative.theme} messaging is outperforming with ${scaleCreative.qualityScore} quality.`,
              tone: "good" as const,
              href: "/admin/growth",
            }
          : {
              title: "Creative performance is mixed",
              detail: "No single creative is clearly breaking away from the pack in this window.",
              tone: "watch" as const,
              href: "/admin/growth",
            },
      {
        title: "Referral engine",
        detail:
          referrals.viral_coefficient >= 1
            ? `Referral coefficient is ${round1(referrals.viral_coefficient)} with ${referrals.completions_from_invites} completions from invites.`
            : `Referral coefficient is ${round1(referrals.viral_coefficient)}. Invite quality and chain depth still need work.`,
        tone: referrals.viral_coefficient >= 1 ? ("good" as const) : ("watch" as const),
        href: "/admin/growth",
      },
    ],
    topChannels: channelEfficiency.channels.slice(0, 6),
    topCreatives: creativeIntelligence.creatives.slice(0, 4),
    messageThemes: creativeIntelligence.messageThemes.slice(0, 5),
    referrals: {
      totalInvites: referrals.total_invites ?? 0,
      uniqueReferrers: referrals.unique_referrers ?? 0,
      completionsFromInvites: referrals.completions_from_invites ?? 0,
      viralCoefficient: round1(referrals.viral_coefficient ?? 0),
    },
    trustWarnings: [channelEfficiency.trust.warning, creativeIntelligence.trust.warning].filter(
      Boolean
    ),
  };
}
