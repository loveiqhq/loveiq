/**
 * Client-side admin utilities (safe for "use client" components).
 */

export function getCsrfToken(): string {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
  return cookie?.substring(cookie.indexOf("=") + 1) || "";
}

export function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, "$1***$2");
}
