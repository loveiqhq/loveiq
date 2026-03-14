type AdminMagicLinkEmailParams = {
  magicLink: string;
};

export function adminMagicLinkEmail({ magicLink }: AdminMagicLinkEmailParams) {
  const subject = "Your LoveIQ admin login link";

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111; line-height:1.5;">
    <h1 style="font-size:22px; margin:0 0 16px 0;">Sign in to LoveIQ Admin</h1>

    <p style="margin:0 0 20px 0;">Click the button below to sign in to the admin panel:</p>

    <a href="${escapeHtml(magicLink)}" style="display:inline-block; padding:12px 28px; background:#f26d4f; color:#fff; text-decoration:none; border-radius:6px; font-weight:600;">Sign in</a>

    <p style="margin:24px 0 6px 0; font-size:13px; color:#666;">Or copy and paste this URL into your browser:</p>
    <p style="margin:0 0 20px 0; font-size:13px; word-break:break-all; color:#444;">${escapeHtml(magicLink)}</p>

    <p style="margin:0; font-size:13px; color:#999;">This link expires in 1 hour. If you didn&rsquo;t request this, you can safely ignore this email.</p>
  </div>`;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
