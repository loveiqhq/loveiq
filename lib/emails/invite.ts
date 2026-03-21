type InviteEmailParams = {
  referrerName?: string | null;
  surveyUrl: string;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inviteEmail({ referrerName, surveyUrl }: InviteEmailParams) {
  const safeName = referrerName?.trim() ? escapeHtml(referrerName.trim()) : null;
  const safeUrl = escapeHtml(surveyUrl);

  const subject = "Check out LoveIQ";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#e8e8e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8e8e8;">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; border-radius:12px; overflow:hidden; background-color:#ffffff;">

        <!-- Header: Logo -->
        <tr>
          <td style="padding: 20px 28px; background-color:#ffffff;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:22px; height:22px; border-radius:50%; background: linear-gradient(135deg, #2e0147 0%, #fe6839 100%); text-align:center; vertical-align:middle; font-size:11px; color:#ffffff;">&#x2764;</td>
                <td style="padding-left:10px; font-family: Georgia, 'Times New Roman', serif; font-size:20px; font-weight:600; color:#000000; letter-spacing:-0.3px;">LoveIQ</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 36px 28px 40px; background-color:#f4f8fe;">

            <!-- Heading -->
            <h1 style="margin:0 0 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:30px; font-weight:700; line-height:1.2; color:#000000;">
              Check out LoveIQ
            </h1>

            <!-- Greeting -->
            <p style="margin:0 0 24px 0; font-size:16px; line-height:1.5; color:#000000;">
              Hey :),
            </p>

            <!-- Message -->
            <p style="margin:0 0 12px 0; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:1.6; color:#000000;">
              I took the LoveIQ survey and it gave me real clarity on my intimate patterns, desires, and potentials. It is much better than I expected.
            </p>

            <p style="margin:0 0 28px 0; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:1.6; color:#000000;">
              You should try it out:
            </p>

            <!-- CTA Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="${safeUrl}" target="_blank" style="display:inline-block; padding:14px 36px; background: linear-gradient(120deg, #fe6839 0%, #ff7f3e 40%, #ff9450 70%, #c36ddf 100%); color:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; font-weight:700; text-decoration:none; border-radius:100px; letter-spacing:0.2px;">
                  Take the Assessment &rarr;
                </a>
              </td></tr>
            </table>

            <!-- Help text -->
            <p style="margin:32px 0 0 0; font-size:14px; line-height:1.5; color:#555555;">
              If you didn't make this request or you need assistance, <a href="mailto:hello@loveiq.org" style="color:#555555;">contact us</a>.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 28px 28px; background-color:#000000;">
            <p style="margin:0 0 6px 0; font-size:11px; font-weight:700; color:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
              LoveIQ UG i.G.
            </p>
            <p style="margin:0 0 6px 0; font-size:11px; line-height:1.6; color:#9a9a9a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
              Democratizing sexual psychology. We translate complex research into actionable insights for everyday life.
            </p>
            <p style="margin:0; font-size:11px; font-weight:700; color:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
              loveiq.org
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const senderLine = safeName
    ? `${safeName} thinks you'd like LoveIQ.`
    : "Someone thinks you'd like LoveIQ.";

  const text = `Check out LoveIQ

Hey :),

${senderLine}

I took the LoveIQ survey and it gave me real clarity on my intimate patterns, desires, and potentials. It is much better than I expected.

You should try it out: ${surveyUrl}

If you didn't make this request or you need assistance, contact us at hello@loveiq.org.

---
LoveIQ UG i.G.
Democratizing sexual psychology. We translate complex research into actionable insights for everyday life.
loveiq.org`;

  return { subject, html, text };
}
