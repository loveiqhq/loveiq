import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { credentialKind } from "@features/brain/server/ingest/upsert";

/**
 * Indexing a credential is not the same act as letting someone read a document.
 * It copies the secret into a searchable table, into every LLM prompt that
 * retrieves it, and into a provider that may train on those prompts — three
 * copies that cannot be recalled. So this guard sits at the shared write path and
 * every source is covered by it.
 *
 * The guard must be right in BOTH directions. A pattern that eats real content is
 * worse than no pattern, because the loss is silent: a page simply never appears
 * in an answer and nobody knows why.
 *
 * EVERY VALUE HERE IS ASSEMBLED AT RUNTIME, NEVER WRITTEN AS A LITERAL.
 * An earlier version of this file spelled the shapes out, and two of them were
 * real credentials pasted from a chat. GitHub's push protection refused the push
 * — correctly, on a public repository. Building the strings from a prefix plus
 * filler means the file contains no secret-shaped literal at all, so neither a
 * scanner nor a human reader can mistake a fixture for a live key.
 */
const FILL = "EXAMPLEONLY0123456789abcdefghijklmnopqrstuvwxyz";

/** A syntactically valid, obviously fake credential of the given prefix. */
function fake(prefix: string, length = 40): string {
  return prefix + FILL.repeat(3).slice(0, length);
}

describe("credentialKind catches real secrets", () => {
  it.each([
    ["github classic", fake("ghp_", 36)],
    ["github fine-grained", fake("github_pat_", 40)],
    ["notion internal", fake("ntn_", 43)],
    ["notion legacy", fake("secret_", 43)],
    ["google api key", fake("AIza", 35)],
    ["google oauth secret", fake("GOCSPX-", 28)],
    ["slack bot", "xoxb-" + FILL.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30)],
    ["stripe live", fake("sk_live_", 32)],
    ["stripe restricted", fake("rk_test_", 32)],
    ["stripe webhook", fake("whsec_", 32)],
    ["anthropic", fake("sk-ant-", 32)],
    ["jwt", "eyJ" + FILL.slice(0, 20) + "." + FILL.slice(0, 20) + ".sig"],
    // Assembled too: even the bare PEM header trips a secret scanner, and a
    // scan that has to be loosened for a test fixture is worth less than the
    // fixture.
    ["pem private key", `${"-".repeat(5)}BEGIN RSA PRIVATE ${"KEY"}${"-".repeat(5)}\n${FILL}`],
    ["aws access key", "AKIA" + "IOSFODNN7EXAMPLE"],
    ["posthog personal", fake("phx_", 40)],
    ["posthog session", fake("phs_", 40)],
    ["resend", fake("re_", 28)],
    ["vercel project token", fake("vcp_", 40)],
    ["vercel team token", fake("vct_", 40)],
    ["figma personal token", fake("figd_", 36)],
  ])("refuses a chunk containing a %s", (_label, secret) => {
    expect(credentialKind(`Some notes about setup.\n\n${secret}\n\nMore notes.`)).not.toBeNull();
  });
});

describe("credentialKind leaves real content alone", () => {
  it.each([
    // The PUBLIC PostHog project token ships in client-side JavaScript, so it is
    // deliberately allowed — refusing it would drop our own analytics
    // documentation for no security gain.
    ["the public PostHog project token", fake("phc_", 40)],
    ["a git sha", "Fixed in a7f555ab9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f, see the PR."],
    ["a uuid", "Submission 3cae0cbe-f1a3-380e-b483-d94fc5a2e2fb was refunded."],
    ["a Notion page id", "https://notion.so/2a3e0cbef1a3804e9e5fe5404fd4dbf9"],
    [
      "base64 prose",
      "The payload was " + Buffer.from("hello world, this is fine").toString("base64"),
    ],
    ["the word resend", "The resend button on the confirmation screen is broken."],
    ["env var names", "Set STRIPE_SECRET_KEY and RESEND_API_KEY in Vercel."],
    ["a long slug", "features/brain/server/ingest/upsert.ts handles this at the write path"],
    ["a phone number", "Call the office on +49 30 123456789 if it breaks."],
    // Must not be mistaken for a Vercel token: project and deployment IDs are
    // pasted into docs and Slack constantly, and eating them would silently drop
    // real deployment notes.
    ["a Vercel project id", "Deployed to prj_DzpCLnVP476gli8BwxFoikxBk0vp last night."],
    ["a Vercel deployment id", "See dpl_BDXqmphyxCiBm6togjKuxvJ61KTF for the build log."],
    ["a Vercel team id", "Team is team_n4LtofwIARvH2BTgKXmwGSmV."],
    ["an ordinary sentence", "We charge 39.99 for the full report and 19.99 for essentials."],
  ])("allows %s", (_label, text) => {
    expect(credentialKind(text)).toBeNull();
  });
});
