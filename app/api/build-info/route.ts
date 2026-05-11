import { NextResponse } from "next/server";

// Build-info probe. Returns the commit SHA that produced this deployment so
// the post-deploy smoke-test (ci.yml) can verify it hit the build it tested,
// not a stale cache or an earlier deploy that finished after a newer one.
//
// SHA is sourced from Vercel's VERCEL_GIT_COMMIT_SHA env (auto-populated on
// every deploy) and falls back to the local `git rev-parse` value baked at
// build time. Both are public — there's no secret here, just provenance.

export const dynamic = "force-static";
export const revalidate = false;

const SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  null;

export async function GET() {
  return NextResponse.json(
    {
      sha: SHA,
      builtAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    {
      headers: {
        // Never cache this — smoke-test reads it to verify "did I hit the right deploy?"
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}
