import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Report links, /why, the survey, checkout and the staging login must stay out of search
 * results. robots.txt keeps most crawlers off them but lets Google and Bing in, because a page
 * they cannot fetch never shows them its noindex. So every page under those paths has to say
 * noindex itself, and must not inherit the root layout's canonical, which names the home page:
 * "don't index this" and "this is the home page" sent together contradict each other.
 */

// The pages' components play no part in their metadata. Stubbing them keeps the imports below,
// which count against this test's timeout, from loading the whole report and survey (~30 s cold).
vi.mock("@features/report/ui/ReportPage", () => ({ default: () => null }));
vi.mock("@features/survey/ui/SurveyPage", () => ({ default: () => null }));
vi.mock("@features/unlock-feedback/ui/WhyPage", () => ({ default: () => null }));
vi.mock("@features/staging/ui/StagingLoginForm", () => ({ default: () => null }));
vi.mock("@features/checkout/ui/CheckoutReturnPage", () => ({ default: () => null }));

afterEach(() => vi.unstubAllEnvs());

/** The paths robots.txt keeps from other crawlers but lets Googlebot fetch. */
async function pathsOnlySearchEnginesMayFetch(): Promise<string[]> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
  const rules = [(await import("@/app/robots")).default().rules].flat();
  const everyone = rules.find((rule) => rule.userAgent === "*");
  // A crawler without a group of its own follows "*".
  const google = rules.find((rule) => rule.userAgent === "Googlebot") ?? everyone;
  const closedToGoogle = new Set([google?.disallow ?? []].flat());
  return [everyone?.disallow ?? []].flat().filter((path) => !closedToGoogle.has(path));
}

/** A file under the repo as its import specifier: app/why/page.tsx → "@/app/why/page". */
const specifierOf = (file: string) =>
  "@/" +
  relative(process.cwd(), file)
    .split(sep)
    .join("/")
    .replace(/\.tsx$/, "");

/** Every page.tsx at or below an app route, as an import specifier. */
function pagesUnder(route: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name === "page.tsx"
          ? [join(dir, entry.name)]
          : []
    );
  return walk(join(process.cwd(), "app", route)).map(specifierOf);
}

describe("private pages", () => {
  it("tell search engines not to index them, and name no canonical", async () => {
    const routes = await pathsOnlySearchEnginesMayFetch();
    expect(routes, "robots.txt lets search engines fetch no private path").not.toEqual([]);

    const pages = routes.flatMap(pagesUnder);
    expect(pages.length).toBeGreaterThanOrEqual(routes.length);
    for (const page of pages) {
      const { metadata } = await import(/* @vite-ignore */ page);
      expect.soft(metadata?.robots, page).toMatchObject({ index: false, follow: false });
      expect
        .soft(metadata?.alternates?.canonical, `${page} inherits the home page's canonical`)
        .toBeNull();
    }
  }, 60_000);
});
