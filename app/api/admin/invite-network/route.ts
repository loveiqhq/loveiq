import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { maskEmail } from "@features/admin/server/format";
import logger from "@shared/observability/logger";

interface InviteEvent {
  id: number;
  referrer_email: string;
  recipient_email: string | null;
  invite_method: string | null;
  created_at: string;
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-invite-network",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/invite_event?select=id,referrer_email,recipient_email,invite_method,created_at&order=created_at.desc`,
      { headers: { Range: "0-999" } }
    );

    if (!res.ok) {
      logger.error("Invite network: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const events = (await res.json()) as InviteEvent[];

    // Build node and edge maps
    const nodeMap = new Map<
      string,
      { invitesSent: number; invitesReceived: number; methods: Set<string> }
    >();

    const ensureNode = (email: string) => {
      if (!nodeMap.has(email)) {
        nodeMap.set(email, { invitesSent: 0, invitesReceived: 0, methods: new Set() });
      }
      return nodeMap.get(email)!;
    };

    const edges: Array<{ from: string; to: string; method: string; date: string }> = [];
    const methodCounts = new Map<string, number>();

    for (const e of events) {
      const referrer = ensureNode(e.referrer_email);
      referrer.invitesSent++;
      if (e.invite_method) referrer.methods.add(e.invite_method);

      const recipientEmail = e.recipient_email || "unknown";
      const recipient = ensureNode(recipientEmail);
      recipient.invitesReceived++;

      edges.push({
        from: maskEmail(e.referrer_email),
        to: maskEmail(recipientEmail),
        method: e.invite_method || "unknown",
        date: e.created_at,
      });

      const method = e.invite_method || "unknown";
      incrementCount(methodCounts, method);
    }

    const nodes = Array.from(nodeMap.entries()).map(([email, data]) => ({
      id: maskEmail(email),
      invitesSent: data.invitesSent,
      invitesReceived: data.invitesReceived,
      methods: Array.from(data.methods),
    }));

    // Top referrers (sorted by invites sent)
    const topReferrers = Array.from(nodeMap.entries())
      .filter(([, d]) => d.invitesSent > 0)
      .sort(([, a], [, b]) => b.invitesSent - a.invitesSent)
      .map(([email, d]) => ({
        email: maskEmail(email),
        count: d.invitesSent,
        methods: Array.from(d.methods),
      }));

    const uniqueReferrers = topReferrers.length;
    const uniqueRecipients = Array.from(nodeMap.values()).filter(
      (n) => n.invitesReceived > 0
    ).length;

    return NextResponse.json({
      nodes,
      edges,
      topReferrers,
      stats: {
        totalInvites: events.length,
        uniqueReferrers,
        uniqueRecipients,
        avgInvitesPerReferrer:
          uniqueReferrers > 0 ? Math.round((events.length / uniqueReferrers) * 10) / 10 : 0,
        methodBreakdown: Object.fromEntries(methodCounts),
      },
    });
  } catch (err) {
    logger.error({ err }, "Invite network error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
