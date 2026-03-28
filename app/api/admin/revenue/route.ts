import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface PaymentRow {
  id: number;
  amount: number;
  currency: string;
  status: string;
  card_brand: string | null;
  failure_code: string | null;
  failure_message: string | null;
  refund_amount: number | null;
  payment_date_time: string;
}

interface PaymentItemRow {
  item_name: string;
  total_price: number;
}

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
    bucket: "admin-revenue",
    limit: 15,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const dateFilter = since ? `&payment_date_time=gte.${since}` : "";

  try {
    const [paymentsRes, itemsRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/payment?select=id,amount,currency,status,card_brand,failure_code,failure_message,refund_amount,payment_date_time${dateFilter}&order=payment_date_time.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/payment_item?select=item_name,total_price`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    if (!paymentsRes.ok) {
      logger.error({ status: paymentsRes.status }, "Revenue query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const payments = (await paymentsRes.json()) as PaymentRow[];
    const items = itemsRes.ok ? ((await itemsRes.json()) as PaymentItemRow[]) : [];

    // Totals
    const succeeded = payments.filter((p) => p.status === "succeeded");
    const totalRevenue = succeeded.reduce((s, p) => s + (p.amount || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayRevenue = succeeded
      .filter((p) => p.payment_date_time?.slice(0, 10) === today)
      .reduce((s, p) => s + (p.amount || 0), 0);
    const transactionCount = payments.length;
    const uniqueUsers = new Set(payments.map((p) => p.id)).size;
    const avgPerUser = uniqueUsers > 0 ? Math.round((totalRevenue / uniqueUsers) * 100) / 100 : 0;
    const successRate =
      transactionCount > 0 ? Math.round((succeeded.length / transactionCount) * 100 * 10) / 10 : 0;

    // Daily revenue
    const dailyMap: Record<string, { amount: number; count: number }> = {};
    for (const p of succeeded) {
      const day = p.payment_date_time?.slice(0, 10) || "unknown";
      if (!dailyMap[day]) dailyMap[day] = { amount: 0, count: 0 };
      dailyMap[day].amount += p.amount || 0;
      dailyMap[day].count++;
    }
    const dailyRevenue = Object.entries(dailyMap)
      .map(([date, d]) => ({ date, amount: Math.round(d.amount * 100) / 100, count: d.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Status breakdown
    const statusMap: Record<string, number> = {};
    for (const p of payments) {
      statusMap[p.status] = (statusMap[p.status] || 0) + 1;
    }
    const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // Failure codes
    const failureMap: Record<string, number> = {};
    for (const p of payments.filter((p) => p.status === "failed" && p.failure_code)) {
      const key = `${p.failure_code}||${p.failure_message || ""}`;
      failureMap[key] = (failureMap[key] || 0) + 1;
    }
    const failureCodes = Object.entries(failureMap)
      .map(([key, count]) => {
        const [code, message] = key.split("||");
        return { code, message, count };
      })
      .sort((a, b) => b.count - a.count);

    // Card brands
    const brandMap: Record<string, number> = {};
    for (const p of succeeded.filter((p) => p.card_brand)) {
      brandMap[p.card_brand!] = (brandMap[p.card_brand!] || 0) + 1;
    }
    const cardBrands = Object.entries(brandMap)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);

    // Refunds
    const refunded = payments.filter((p) => p.status === "refunded");
    const refundTotal = refunded.reduce((s, p) => s + (p.refund_amount || p.amount || 0), 0);
    const refundRate =
      transactionCount > 0 ? Math.round((refunded.length / transactionCount) * 100 * 10) / 10 : 0;

    // Section revenue
    const sectionMap: Record<string, { revenue: number; count: number }> = {};
    for (const item of items) {
      if (!sectionMap[item.item_name]) sectionMap[item.item_name] = { revenue: 0, count: 0 };
      sectionMap[item.item_name].revenue += item.total_price || 0;
      sectionMap[item.item_name].count++;
    }
    const sectionRevenue = Object.entries(sectionMap)
      .map(([name, d]) => ({
        name,
        revenue: Math.round(d.revenue * 100) / 100,
        count: d.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      transactionCount,
      avgPerUser,
      successRate,
      dailyRevenue,
      statusBreakdown,
      failureCodes,
      cardBrands,
      refundTotal: Math.round(refundTotal * 100) / 100,
      refundRate,
      sectionRevenue,
    });
  } catch (err) {
    logger.error({ err }, "Revenue analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
