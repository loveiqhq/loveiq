// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const utm = vi.hoisted(() => ({ rememberLandingPath: vi.fn(), captureUtmFromUrl: vi.fn() }));
vi.mock("@shared/url/utm", () => utm);

import UtmCapture from "@shared/ui/UtmCapture";

/**
 * The root layout's capture keeps the first page this browser opened, which the survey sends
 * and the #incoming-surveys message shows as "First page".
 */
describe("UtmCapture", () => {
  it("keeps the first page and captures the campaign tags on every page load", () => {
    render(<UtmCapture />);
    expect(utm.rememberLandingPath).toHaveBeenCalledTimes(1);
    expect(utm.captureUtmFromUrl).toHaveBeenCalledTimes(1);
  });
});
