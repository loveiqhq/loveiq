type InviteEmailParams = {
  referrerName?: string | null;
  ctaUrl: string;
  siteUrl: string;
  variant: "a" | "b";
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inviteEmail({ referrerName, ctaUrl, siteUrl, variant }: InviteEmailParams) {
  const firstName = referrerName?.trim() ? escapeHtml(referrerName.trim().split(/\s+/)[0]) : null;
  const safeCtaUrl = escapeHtml(ctaUrl);
  const logoUrl = `${siteUrl}/apple-touch-icon.png`;

  const font =
    "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

  const subject =
    variant === "a"
      ? "Check out LoveIQ - it was super helpful"
      : "I found out something about myself I can't stop thinking about";

  const headline = variant === "a" ? "You should definitely try LoveIQ" : "This opened my eyes.";

  const bodyParagraphs =
    variant === "a"
      ? `<p style="margin:0 0 16px 0; font-family:${font}; font-size:16px; line-height:1.7; color:#1a1a1a;">
          I recently came across LoveIQ and honestly wasn't sure what to expect. It turned out to be one of the more useful things I've done for myself in a while — it gave me real clarity on patterns I'd noticed but never quite had words for.
        </p>
        <p style="margin:0 0 32px 0; font-family:${font}; font-size:16px; line-height:1.7; color:#1a1a1a;">
          I thought of you and figured you might find it worthwhile too.
        </p>`
      : `<p style="margin:0 0 16px 0; font-family:${font}; font-size:16px; line-height:1.7; color:#1a1a1a;">
          I did something recently that I keep thinking about. I'm not going to say more than that — it's one of those things that lands differently depending on the person, and I think you should find out for yourself.
        </p>
        <p style="margin:0 0 32px 0; font-family:${font}; font-size:16px; line-height:1.7; color:#1a1a1a;">
          All I'll say is: it's about you, and it might surprise you.
        </p>`;

  const signOff = firstName
    ? `With kindness, ${firstName} sent via LoveIQ`
    : "With kindness, sent via LoveIQ";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f0f0f0; font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; border-radius:12px; overflow:hidden; background-color:#ffffff;">

        <!-- Logo row -->
        <tr>
          <td style="padding:24px 32px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:22px; height:22px;">
                  <img src="${logoUrl}" alt="LoveIQ" width="22" height="22" style="display:block; border-radius:5px;" />
                </td>
                <td style="padding-left:9px; font-family:Georgia, 'Times New Roman', serif; font-size:17px; font-weight:600; color:#111111; letter-spacing:-0.2px;">
                  LoveIQ
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:8px 32px 40px;">

            <h1 style="margin:0 0 24px 0; font-family:${font}; font-size:26px; font-weight:600; line-height:1.25; color:#111111; letter-spacing:-0.4px;">
              ${headline}
            </h1>

            ${bodyParagraphs}

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <a href="${safeCtaUrl}" target="_blank" style="display:inline-block; padding:13px 28px; background-color:#111111; color:#ffffff; font-family:${font}; font-size:15px; font-weight:500; text-decoration:none; border-radius:8px; letter-spacing:0.1px;">
                    Check out LoveIQ
                  </a>
                </td>
              </tr>
            </table>

            <!-- Sign-off -->
            <p style="margin:36px 0 0 0; font-family:${font}; font-size:15px; line-height:1.6; color:#555555;">
              ${signOff}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px; background-color:#f7f7f7; border-top:1px solid #e8e8e8;">
            <p style="margin:0 0 4px 0; font-family:${font}; font-size:11px; color:#999999;">
              LoveIQ UG i.G. &middot; loveiq.org
            </p>
            <p style="margin:0; font-family:${font}; font-size:11px; line-height:1.5; color:#bbbbbb;">
              You received this because someone who knows you wanted to share LoveIQ with you.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const bodyText =
    variant === "a"
      ? `I recently came across LoveIQ and honestly wasn't sure what to expect. It turned out to be one of the more useful things I've done for myself in a while — it gave me real clarity on patterns I'd noticed but never quite had words for.\n\nI thought of you and figured you might find it worthwhile too.`
      : `I did something recently that I keep thinking about. I'm not going to say more than that — it's one of those things that lands differently depending on the person, and I think you should find out for yourself.\n\nAll I'll say is: it's about you, and it might surprise you.`;

  const text = `${headline}

${bodyText}

Check out LoveIQ: ${ctaUrl}

${signOff}

---
LoveIQ UG i.G. · loveiq.org`;

  return { subject, html, text };
}
