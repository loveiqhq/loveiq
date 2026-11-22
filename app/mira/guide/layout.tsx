import type { ReactNode } from "react";
import { getMiraAccount } from "@features/mira/server/session";
import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { MiraFrame } from "@features/mira/ui/MiraShell";

/**
 * The guide is open to everyone: signed out in the open pages' frame, signed in inside the app's
 * frame with Guide marked in the menu (round-2 UX-3), like every other page the menu leads to.
 */
export default async function GuideLayout({ children }: { children: ReactNode }) {
  const account = await getMiraAccount();
  return account ? (
    <MiraAppFrame active="guide" email={account.email}>
      {children}
    </MiraAppFrame>
  ) : (
    <MiraFrame>{children}</MiraFrame>
  );
}
