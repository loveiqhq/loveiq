/**
 * Admin display formatting utilities.
 */

export function maskEmail(email: string): string {
  // Index-based, not `^(.).+(@.+)$`: that pattern needs TWO characters before
  // the `@`, so `a@b.com` never matched and `.replace` handed the address back
  // verbatim — the helper returning exactly what it exists to withhold. 3 of
  // 1,961 live users have a one-character local part. Anything with no local
  // part or no `@` is never echoed at all.
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at < 1) return "***";
  return `${trimmed.slice(0, 1)}***${trimmed.slice(at)}`;
}
