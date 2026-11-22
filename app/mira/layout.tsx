import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { MiraLookRoot } from "@features/mira/ui/MiraLook";
import { LOOK_COOKIE, parseLook } from "@features/mira/ui/prefs";

/**
 * Every Mira page, in the theme and text size this browser chose (Settings › Appearance), read
 * from its cookie here so the first HTML is already right: no flash of the wrong theme, no script.
 * System follows the device in CSS (tailwind.config.js).
 */
export default async function MiraLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  return <MiraLookRoot initial={parseLook(jar.get(LOOK_COOKIE)?.value)}>{children}</MiraLookRoot>;
}
