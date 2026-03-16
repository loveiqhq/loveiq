/**
 * Client-side CSRF utilities (safe for "use client" components).
 * Server-side verification is in lib/csrf.ts.
 */
export function getCsrfToken(): string {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
  return cookie?.substring(cookie.indexOf("=") + 1) || "";
}
