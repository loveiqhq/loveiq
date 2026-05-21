import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-revenue-transactions",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const status = url.searchParams.get("status");
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = `/rest/v1/payment?select=id,amount,currency,status,card_brand,card_last4,payment_date_time,failure_code&order=payment_date_time.desc`;
  if (status) query += `&status=eq.${status}`;

  try {
    const res = await supabaseFetch(query, {
      headers: { Range: `${from}-${to}`, Prefer: "count=exact" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Revenue transactions query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const transactions = await res.json();
    const total = parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);

    return NextResponse.json({ transactions, total, page, pageSize });
  } catch (err) {
    logger.error({ err }, "Revenue transactions error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
