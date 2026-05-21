/**
 * Admin display formatting utilities.
 */

export function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, "$1***$2");
}
