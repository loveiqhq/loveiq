import { describe, it, expect } from "vitest";
import { waitlistEmail } from "../../../lib/emails/waitlist";

describe("waitlistEmail", () => {
  it("returns subject, html, and text", () => {
    const result = waitlistEmail({});
    expect(result.subject).toContain("on the LoveIQ waitlist");
    expect(result.html).toContain("on the LoveIQ waitlist");
    expect(result.text).toContain("on the LoveIQ waitlist");
  });

  it("uses generic greeting when no firstName provided", () => {
    const result = waitlistEmail({});
    expect(result.html).toContain("Hi,");
    expect(result.text).toContain("Hi,");
  });

  it("uses generic greeting when firstName is null", () => {
    const result = waitlistEmail({ firstName: null });
    expect(result.html).toContain("Hi,");
  });

  it("uses generic greeting when firstName is empty string", () => {
    const result = waitlistEmail({ firstName: "" });
    expect(result.html).toContain("Hi,");
  });

  it("uses generic greeting when firstName is whitespace", () => {
    const result = waitlistEmail({ firstName: "   " });
    expect(result.html).toContain("Hi,");
  });

  it("includes firstName in greeting when provided", () => {
    const result = waitlistEmail({ firstName: "Alice" });
    expect(result.html).toContain("Hi Alice,");
    expect(result.text).toContain("Hi Alice,");
  });

  it("escapes HTML special characters in firstName (XSS prevention)", () => {
    const result = waitlistEmail({ firstName: '<script>alert("xss")</script>' });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).toContain("&lt;/script&gt;");
  });

  it("escapes ampersands in firstName", () => {
    const result = waitlistEmail({ firstName: "Tom & Jerry" });
    expect(result.html).toContain("Tom &amp; Jerry");
  });

  it("escapes quotes in firstName", () => {
    const result = waitlistEmail({ firstName: 'O"Brien' });
    expect(result.html).toContain("O&quot;Brien");
  });

  it("escapes single quotes in firstName", () => {
    const result = waitlistEmail({ firstName: "O'Brien" });
    expect(result.html).toContain("O&#039;Brien");
  });

  it("includes all expected email content sections", () => {
    const result = waitlistEmail({ firstName: "Test" });
    expect(result.html).toContain("LoveIQ Early Access");
    expect(result.html).toContain("hello@loveiq.org");
    expect(result.text).toContain("LoveIQ Early Access");
    expect(result.text).toContain("hello@loveiq.org");
  });

  it("HTML output matches snapshot (with firstName)", () => {
    const { html } = waitlistEmail({ firstName: "Alice" });
    expect(html).toMatchSnapshot();
  });

  it("HTML output matches snapshot (no firstName)", () => {
    const { html } = waitlistEmail({});
    expect(html).toMatchSnapshot();
  });

  it("text output matches snapshot", () => {
    const { text } = waitlistEmail({ firstName: "Alice" });
    expect(text).toMatchSnapshot();
  });
});
