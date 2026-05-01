type WaitlistEmailParams = {
  firstName?: string | null;
};

export function waitlistEmail({ firstName }: WaitlistEmailParams) {
  const greetingName = (firstName || "").trim();
  const hiLine = greetingName ? `Hi ${escapeHtml(greetingName)},` : "Hi,";

  const subject = "You\u2019re on the LoveIQ waitlist";

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111; line-height:1.5;">
    <h1 style="font-size:26px; margin:0 0 16px 0;">You\u2019re on the LoveIQ waitlist</h1>

    <p style="margin:0 0 14px 0;">${hiLine}</p>

    <p style="margin:0 0 14px 0;"><strong>Welcome to LoveIQ.</strong></p>

    <p style="margin:0 0 14px 0;">
      You\u2019re now on the waitlist for <strong>LoveIQ Early Access</strong> \u2014 a new way to understand how you experience desire, intimacy, and connection through a <strong>scientifically grounded psychometric survey and a personalized report.</strong>
    </p>

    <p style="margin:0 0 10px 0;"><strong>Early Access gives you:</strong></p>

    <ul style="margin:0 0 14px 18px; padding:0;">
      <li style="margin:0 0 8px 0;">Preferred full access to the LoveIQ archetype survey</li>
      <li style="margin:0 0 8px 0;">Your personal LoveIQ report</li>
      <li style="margin:0 0 8px 0;">Early versions of features as the platform evolves</li>
    </ul>

    <p style="margin:0 0 14px 0;">
      It\u2019s free, private, and designed to be respectful, non-judgmental, and psychologically safe.
    </p>

    <p style="margin:0 0 18px 0;">
      <strong>We\u2019ll email you as soon as your invitation is ready.</strong>
    </p>

    <p style="margin:0 0 6px 0;">\u2014 The LoveIQ Team</p>

    <hr style="border:none; border-top:1px solid #eee; margin:18px 0;" />

    <p style="margin:0; font-size:12px; color:#555;">
      If you didn\u2019t make this request or you need assistance, contact us at
      <a href="mailto:hello@loveiq.org" style="color:#555;">hello@loveiq.org</a>.
    </p>
  </div>
  `;

  const text = [
    "You\u2019re on the LoveIQ waitlist",
    "",
    hiLine,
    "",
    "Welcome to LoveIQ.",
    "",
    "You\u2019re now on the waitlist for LoveIQ Early Access \u2014 a new way to understand how you experience desire, intimacy, and connection through a scientifically grounded psychometric survey and a personalized report.",
    "",
    "Early Access gives you:",
    "- Preferred full access to the LoveIQ archetype survey",
    "- Your personal LoveIQ report",
    "- Early versions of features as the platform evolves",
    "",
    "It\u2019s free, private, and designed to be respectful, non-judgmental, and psychologically safe.",
    "",
    "We\u2019ll email you as soon as your invitation is ready.",
    "",
    "\u2014 The LoveIQ Team",
    "",
    "If you didn\u2019t make this request or you need assistance, contact us at hello@loveiq.org.",
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
