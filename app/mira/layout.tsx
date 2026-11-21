import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { MIRA_AUTH_COOKIE } from "@features/mira/server/config";
import { MiraLookRoot } from "@features/mira/ui/MiraLook";
import { LOOK_COOKIE, parseLook } from "@features/mira/ui/prefs";

/**
 * Every Mira page, in the theme and text size this browser chose (Settings › Appearance), read
 * from its cookie here so the first HTML is already right: no flash of the wrong theme, no script.
 * System follows the device in CSS (tailwind.config.js).
 */
export default async function MiraLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  // @supabase/ssr splits a long session into mira-auth.0, mira-auth.1, …
  const signedIn = jar
    .getAll()
    .some((c) => c.name === MIRA_AUTH_COOKIE || c.name.startsWith(`${MIRA_AUTH_COOKIE}.`));
  return (
    <MiraLookRoot initial={parseLook(jar.get(LOOK_COOKIE)?.value)} signedIn={signedIn}>
      {children}
    </MiraLookRoot>
  );
}
