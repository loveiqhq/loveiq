/**
 * How Mira looks in this browser (Settings › Appearance, 21 Nov 2026): Light, Dark or System,
 * and the text size. Kept in a cookie for a year, so app/mira/layout.tsx renders the first HTML
 * with them and nothing flashes; with an account they are saved on the profile too, and a new
 * sign-in brings them to that browser. No "use client": the layout (a server component) reads
 * the cookie with these.
 */
export const THEMES = ["light", "dark", "system"] as const;
export const TEXT_SIZES = ["small", "default", "large"] as const;
export type Theme = (typeof THEMES)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type MiraLook = { theme: Theme; text: TextSize };

export const DEFAULT_LOOK: MiraLook = { theme: "system", text: "default" };

/** `dark.large`: only Mira's pages read it (Path=/mira). */
export const LOOK_COOKIE = "mira_look";
const YEAR_S = 60 * 60 * 24 * 365;

const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v);
const isTextSize = (v: unknown): v is TextSize => (TEXT_SIZES as readonly unknown[]).includes(v);

/** The cookie's value as a look; anything else (missing, old, tampered) is the default. */
export function parseLook(raw: string | null | undefined): MiraLook {
  const [theme, text] = (raw ?? "").split(".");
  return {
    theme: isTheme(theme) ? theme : DEFAULT_LOOK.theme,
    text: isTextSize(text) ? text : DEFAULT_LOOK.text,
  };
}

/** What `document.cookie` is set to for `look`. */
export function lookCookie(look: MiraLook, secure: boolean): string {
  return `${LOOK_COOKIE}=${look.theme}.${look.text}; Path=/mira; Max-Age=${YEAR_S}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The account's saved look (null where never chosen), over this browser's. */
export function accountLook(
  saved: { theme?: string | null; text_size?: string | null },
  current: MiraLook
): MiraLook {
  return {
    theme: isTheme(saved.theme) ? saved.theme : current.theme,
    text: isTextSize(saved.text_size) ? saved.text_size : current.text,
  };
}
