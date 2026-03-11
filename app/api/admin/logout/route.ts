import { NextResponse } from "next/server";
import { verifyCsrfToken } from "@/lib/csrf";

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
