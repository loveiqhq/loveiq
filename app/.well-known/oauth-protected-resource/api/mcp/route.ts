/**
 * GET /.well-known/oauth-protected-resource/api/mcp: the document beside the root one, at
 * the path of the resource itself, which is where a 401 from /api/mcp points.
 */
import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@features/brain/server/sign-in";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json(protectedResourceMetadata(new URL(request.url).origin), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
