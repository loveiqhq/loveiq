/** POST /api/jarvis/sign-out — forget this browser's sign-in, to use another address. */
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@features/admin/server/supabase-server";
import { verifyCsrfToken } from "@shared/http/csrf";

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
