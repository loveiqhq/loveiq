import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import { MiraLookRoot } from "@features/mira/ui/MiraLook";
import { LOOK_COOKIE, parseLook } from "@features/mira/ui/prefs";

/**
 * Every Mira page, in the theme and text size this browser chose (Settings › Appearance), read
 * from its cookie here so the first HTML is already right: no flash of the wrong theme, no script.
 * System follows the device in CSS (tailwind.config.js).
 *
 * Signed in, also the account's country, so "Need support right now?" lists its lines first on
 * every page (round-2 SET-9). A layout renders again only on a full load or a refresh (sign-in,
 * sign-out and deleting the account refresh); a failed read keeps the lines' usual order.
 */
export default async function MiraLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const account = await getMiraAccount();
  const profile = account ? await getProfile(account.id).catch(() => null) : null;
  return (
    <MiraLookRoot
      initial={parseLook(jar.get(LOOK_COOKIE)?.value)}
      country={profile?.country ?? null}
    >
      {children}
    </MiraLookRoot>
  );
}
