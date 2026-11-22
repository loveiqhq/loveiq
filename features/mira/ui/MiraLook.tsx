"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOOK, lookCookie, type MiraLook, type Theme } from "./prefs";

/**
 * How every Mira page looks (Settings › Appearance, 21 Nov 2026): app/mira/layout.tsx renders
 * this root with the browser's cookie, so the first HTML already has the right theme and text
 * size. The colours and sizes themselves are CSS (tailwind.config.js, theme-tokens.js): this only
 * sets `data-mira-theme` and `data-mira-text` and keeps the choice in the cookie. The look is
 * chosen in Settings (System until then), which also saves it on the account, in turn with its
 * other changes.
 */
type LookApi = {
  look: MiraLook;
  /** Shows `patch` at once and keeps it in this browser. */
  change: (patch: Partial<MiraLook>) => void;
  /** The look an account saved, after a sign-in: shown and kept here. */
  adopt: (look: MiraLook) => void;
};

function remember(look: MiraLook): void {
  try {
    document.cookie = lookCookie(look, window.location.protocol === "https:");
  } catch {
    // Cookies blocked: the look holds for this page view.
  }
}

const LookContext = createContext<LookApi>({
  look: DEFAULT_LOOK,
  change: () => undefined,
  adopt: () => undefined,
});

export const useMiraLook = () => useContext(LookContext);

export function MiraLookRoot({ initial, children }: { initial: MiraLook; children: ReactNode }) {
  const [look, setLook] = useState(initial);
  // The latest look, for a change made before the last one has rendered.
  const latest = useRef(initial);

  const adopt = useCallback((next: MiraLook) => {
    latest.current = next;
    setLook(next);
    remember(next);
  }, []);

  const change = useCallback(
    (patch: Partial<MiraLook>) => adopt({ ...latest.current, ...patch }),
    [adopt]
  );

  const api = useMemo(() => ({ look, change, adopt }), [look, change, adopt]);
  return (
    <LookContext.Provider value={api}>
      <div className="mira-root" data-mira-theme={look.theme} data-mira-text={look.text}>
        {children}
      </div>
    </LookContext.Provider>
  );
}

export const THEME_CHOICES: Array<[Theme, string]> = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];

/** Sun, moon, and a screen for System: one stroke, like the chat's icons. */
export function ThemeIcon({ theme, size = 16 }: { theme: Theme; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {theme === "light" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : theme === "dark" ? (
        <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7Z" />
      ) : (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      )}
    </svg>
  );
}
