"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { searchHome, type SearchHit } from "@features/mira/content/coaches";
import { useCoachData, useEmptySearchCount } from "./data";
import { ChevronIcon, SearchIcon } from "./parts";
import { FOCUS } from "./styles";

/**
 * Home's search (board Home, "Search coaches, guides, challenges"): instant, in the browser, over
 * the coaches, the guide's practices and chapters and the person's own chat titles. A combobox:
 * arrows move through the results, Enter opens one, Escape closes the list, then clears it. What
 * is typed never leaves the page; a search that finds nothing is counted without its words.
 * Mounts on Home, usually beside the greeting.
 */
export default function HomeSearch() {
  const router = useRouter();
  const { state } = useCoachData();
  const chats = useMemo(() => (state.status === "ready" ? state.data.chats : []), [state]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const hits = useMemo(() => searchHome(query, chats), [query, chats]);
  const typed = query.trim() !== "";
  const showing = open && typed;
  const id = useId();
  const optionId = (i: number) => `${id}-option-${i}`;
  useEmptySearchCount("home", typed && hits.length === 0);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hits.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) =>
        a < 0 && step < 0 ? hits.length - 1 : (a + step + hits.length) % hits.length
      );
    } else if (e.key === "Enter") {
      const hit = hits[active] ?? hits[0];
      if (!hit) return;
      e.preventDefault();
      go(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (showing) setOpen(false);
      else setQuery("");
      setActive(-1);
    }
  }

  return (
    <div
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Search coaches, the guide and your chats
      </label>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ap-muted" />
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={showing}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? optionId(active) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search coaches, guides, chats"
        className="h-12 w-full rounded-full border border-ap-line bg-white pl-11 pr-4 text-[16px] text-ap-ink caret-ap-purple outline-none transition-colors placeholder:text-ap-muted focus-visible:border-ap-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple"
      />
      {showing ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[20px] border border-ap-line bg-white shadow-[0_18px_40px_-18px_rgba(22,16,33,0.35)] motion-safe:animate-mira-reply">
          {hits.length ? (
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-label="Results"
              className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5"
            >
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // Keeps the focus in the box, so the click lands before the list closes.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ${
                    i === active ? "bg-ap-ground" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ap-ink">
                      {h.title}
                    </span>
                    <span className="block truncate text-[12px] text-ap-muted">{h.meta}</span>
                  </span>
                  <ChevronIcon className="shrink-0 text-ap-quiet" />
                </li>
              ))}
            </ul>
          ) : (
            <div id={`${id}-list`} className="px-4 py-3.5 text-[14px] leading-relaxed text-ap-body">
              Nothing found. Try other words, or{" "}
              <Link
                href="/mira/coaches#finder"
                className={`font-semibold text-ap-plum underline ${FOCUS}`}
              >
                Find my challenge
              </Link>
              .
            </div>
          )}
          {state.status === "error" ? (
            <p className="border-t border-ap-line px-4 py-2 text-[12px] text-ap-muted">
              Your chats aren’t included right now.
            </p>
          ) : null}
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {typed
          ? hits.length
            ? `${hits.length} ${hits.length === 1 ? "result" : "results"}`
            : "Nothing found"
          : ""}
      </p>
    </div>
  );
}
