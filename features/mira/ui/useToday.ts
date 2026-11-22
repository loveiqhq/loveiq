"use client";

import { useCallback, useEffect, useState } from "react";
import { localDay } from "../server/goal-progress";

/**
 * This browser's calendar day ("YYYY-MM-DD"), kept current for the journal and goals: read once
 * the page runs here (the server's clock is UTC, "" until then), again whenever the tab comes back
 * into view or focus, so a tab left open overnight moves on to the new day, and by `fresh()` at the
 * moment a tap acts on "today".
 */
export function useToday(): { today: string; fresh: () => string } {
  const [today, setToday] = useState("");
  const fresh = useCallback(() => {
    const day = localDay(new Date());
    setToday(day);
    return day;
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's clock, after mount
    fresh();
    const back = () => {
      if (document.visibilityState !== "hidden") fresh();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [fresh]);
  return { today, fresh };
}
