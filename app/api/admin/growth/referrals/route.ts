import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";

interface RpcReferrer {
  email: string;
  invite_count: number;
  completions: number;
  conversion_rate: number;
}

interface RpcMethodCount {
  method: string;
  count: number;
}

interface RpcResult {
  total_invites: number;
  unique_referrers: number;
  completions_from_invites: number;
  viral_coefficient: number;
  methods: RpcMethodCount[];
  top_referrers: RpcReferrer[];
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
    bucket: "admin-growth-referrals",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_referral_chains", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error("Growth referrals: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = (await res.json()) as RpcResult;

    // Mask all emails in top_referrers before returning to client
    const maskedReferrers = (data.top_referrers ?? []).map((r) => ({
      ...r,
      email: maskEmail(r.email),
    }));

    return NextResponse.json({
      totalInvites: data.total_invites ?? 0,
      uniqueReferrers: data.unique_referrers ?? 0,
      completionsFromInvites: data.completions_from_invites ?? 0,
      viralCoefficient: data.viral_coefficient ?? 0,
      methods: data.methods ?? [],
      topReferrers: maskedReferrers,
    });
  } catch (err) {
    logger.error({ err }, "Growth referrals error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
