import { NextResponse } from "next/server";

// CSRF-exempt by design. This endpoint only clears the staging_session
// cookie — no DB write, no email send, no privileged action. A CSRF attack
// here can only force a logout from staging, which is a UX annoyance, not
// a security event. Adding CSRF here would require any future logout
// button (or external link) to embed a CSRF token without changing risk.
// See `proxy.ts` for the documented CSRF-exempt route allowlist.
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("staging_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
