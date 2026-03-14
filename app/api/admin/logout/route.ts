import { NextResponse } from "next/server";
import { verifyCsrfToken } from "@/lib/csrf";
import { createSupabaseServer } from "@/lib/admin/supabase-server";

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  // Clear the old admin_session cookie if still present (backward compat cleanup)
  response.cookies.set("admin_session", "", { maxAge: 0, path: "/" });
  return response;
}
