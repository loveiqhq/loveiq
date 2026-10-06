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
      /**
       * The BUILD-TIME twin of `env`, and not the same variable.
       *
       * `isProductionSite()` and `isNonProdDeploy()` both discriminate on
       * `NEXT_PUBLIC_VERCEL_ENV`, which Vercel inlines at build time only when the
       * project has "Automatically expose System Environment Variables" enabled. `env`
       * above is the RUNTIME `VERCEL_ENV`, which is always present — so it being
       * "production" proves nothing about the one the gates actually read.
       *
       * That distinction is load-bearing. If this comes back null on a deployment, the
       * 2026-09-14 fix that stops preview builds identifying as the live site is silently
       * doing nothing, and every preview is loading the real analytics tags again.
       */
      publicEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? null,
    },
    {
      headers: {
        // Never cache this — smoke-test reads it to verify "did I hit the right deploy?"
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}
