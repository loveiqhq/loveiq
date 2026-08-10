import { EMAIL_FONT, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";

export interface TestLinkEmailParams {
  testUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/**
 * Sent when someone asks for their test link from the landing page's
 * "Not in the mood right now?" band. Deliberately short — it exists only to
 * carry the link back to an inbox the person actually checks.
 */
export function testLinkEmail({ testUrl, siteUrl, unsubscribeUrl }: TestLinkEmailParams) {
  const subject = "Your LoveIQ test link";
  const previewText = "Whenever you feel like it — your test is one tap away.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Here&rsquo;s your private test link
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You asked us to send this over so you can take the test whenever the moment is right. No rush, and no account needed.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It takes about <strong style="font-weight:700;">9 minutes</strong>, it is anonymous by default, and you can stop and pick it up again at any time.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: testUrl, label: "Take the LoveIQ test", width: 232 })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 32px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        Questions before you start? Reach us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "Here's your private test link",
    "",
    "You asked us to send this over so you can take the test whenever the moment is right. No rush, and no account needed.",
    "",
    "It takes about 9 minutes, it is anonymous by default, and you can stop and pick it up again at any time.",
    "",
    `Take the LoveIQ test: ${testUrl}`,
    "",
    "Questions before you start? Reach us at hello@loveiq.org.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
