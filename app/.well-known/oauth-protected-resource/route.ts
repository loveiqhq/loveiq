/**
 * GET /.well-known/oauth-protected-resource
 *
 * How Claude learns where to sign in to Jarvis (RFC 9728): the authorization server is
 * Supabase Auth's OAuth 2.1 server. Served at the root and at the /api/mcp suffix
 * (the file beside this one), because clients look in either place.
 */
import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@features/brain/server/sign-in";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json(protectedResourceMetadata(new URL(request.url).origin), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
