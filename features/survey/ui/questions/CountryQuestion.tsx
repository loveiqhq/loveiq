"use client";

import { useState, useRef, useEffect, useCallback, useId, useMemo, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { getCountryFlagUrl } from "@/data/countries";
import { exactCountry, searchCountries } from "./countrySearch";
import QuestionHeading from "./QuestionHeading";
import { useSurveyTheme } from "../SurveyThemeContext";

interface CountryQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
}

const CountryQuestion: FC<CountryQuestionProps> = ({ question, value, onChange }) => {
  const white = useSurveyTheme() === "white";
  // search tracks user typing only while dropdown is open
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Display: when editing show search text, otherwise show selected value
  const displayValue = isEditing ? search : (value ?? "");

  // Filter uses search text when editing, otherwise shows all
  const filterText = isEditing ? search : "";
  const filtered = useMemo(() => searchCountries(filterText), [filterText]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightIndex]) {
        items[highlightIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex]);

  const selectCountry = useCallback(
    (country: string) => {
      onChange(country);
      setSearch("");
      setIsOpen(false);
      setIsEditing(false);
      setHighlightIndex(-1);
      inputRef.current?.blur();
    },
    [onChange]
  );

  // A tap outside closes the list. The typed text stays (it was wiped, so a reader who
  // tapped away mid-word lost it), and a whole name typed is chosen: here as well as on
  // blur, because WebKit keeps the box focused when the tap lands on something that
  // cannot take focus, so on an iPhone the blur never came. pointerdown, not mousedown:
  // WebKit sends no mouse events for a tap on something not clickable (a heading, the
  // page), so on an iPhone a mousedown listener never heard those taps.
  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const exact = isEditing ? exactCountry(search) : null;
        if (exact) selectCountry(exact);
        else setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [isEditing, search, selectCountry]);

  const clearSelection = useCallback(() => {
    onChange("" as string);
    setSearch("");
    setIsEditing(true);
    setIsOpen(true);
    setHighlightIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearch(text);
    setIsEditing(true);
    setIsOpen(true);
    // An exact name or alias is highlighted, so Enter picks what the list shows on top.
    const exact = exactCountry(text);
    setHighlightIndex(exact && searchCountries(text)[0] === exact ? 0 : -1);
    if (value) onChange("" as string);
  };

  // Leaving the box with a whole name typed ("germany", "UK") chooses it: Next stayed
  // disabled until the reader also tapped the name in the list.
  const handleBlur = () => {
    if (!isEditing) return;
    const exact = exactCountry(search);
    if (exact) selectCountry(exact);
  };

  const handleFocus = () => {
    setIsOpen(true);
    if (value) {
      // Start editing with the current value pre-filled
      setSearch(value);
      setIsEditing(true);
      inputRef.current?.select();
    } else {
      setIsEditing(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
        setIsEditing(true);
        return;
      }
      return;
    }

    // Stop propagation for keys that SurveyEngine's global handler would catch
    if (
      e.key === "Enter" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Escape"
    ) {
      e.stopPropagation();
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          // highlightIndex bounds checked above.
          selectCountry(filtered[highlightIndex]!);
        } else if (filtered.length === 1) {
          selectCountry(filtered[0]!);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setIsEditing(false);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <QuestionHeading question={question} />

      <div ref={containerRef} className="relative">
        {/* Search input */}
        <div className="relative">
          {/* Selected flag */}
          {value && !isEditing && getCountryFlagUrl(value) && (
            // eslint-disable-next-line @next/next/no-img-element -- tiny decorative external flag icon
            <img
              aria-hidden="true"
              src={getCountryFlagUrl(value)}
              alt=""
              width={20}
              height={15}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 rounded-[2px]"
            />
          )}

          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search for a country..."
            autoComplete="off"
            role="combobox"
            aria-label={question.question}
            aria-autocomplete="list"
            aria-expanded={isOpen && filtered.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              isOpen && highlightIndex >= 0 ? `${listId}-${highlightIndex}` : undefined
            }
            className={`w-full rounded-xl border py-3 font-sans text-[16px] sm:text-[15px] focus:outline-none ${
              white
                ? "border-black/[0.08] bg-[#f5f6f8] text-[#161021] placeholder:text-black/30 focus:border-[#8b6fbf]"
                : "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-[#a78bfa]"
            } ${value && !isEditing ? "pl-11" : "pl-4"} ${value ? "pr-10" : "pr-4"}`}
          />

          {/* Clear button */}
          {value && (
            <button
              type="button"
              onClick={clearSelection}
              className={`absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full transition ${
                white
                  ? "bg-black/[0.06] text-[#6b6678] hover:bg-black/[0.12] hover:text-[#161021]"
                  : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
              }`}
              aria-label="Clear selection"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Dropdown list */}
        {isOpen && filtered.length > 0 && (
          <ul
            ref={listRef}
            data-lenis-prevent
            className={`absolute z-50 mt-2 max-h-[240px] w-full overflow-y-auto rounded-xl border py-1 ${
              white
                ? "border-black/[0.08] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
                : "border-white/10 bg-[#1a1225]"
            }`}
            role="listbox"
            id={listId}
          >
            {filtered.map((country, i) => (
              <li
                key={country}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={country === value}
                className={`cursor-pointer px-4 py-2.5 font-sans text-[15px] transition-colors ${
                  white
                    ? `text-[#4a4458] ${i === highlightIndex ? "bg-black/[0.06] text-[#161021]" : "hover:bg-black/[0.04]"} ${country === value ? "text-[#6b5b95]" : ""}`
                    : `text-white/80 ${i === highlightIndex ? "bg-white/[0.1] text-white" : "hover:bg-white/[0.07]"} ${country === value ? "text-[#a78bfa]" : ""}`
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCountry(country);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                {getCountryFlagUrl(country) && (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny decorative external flag icon
                  <img
                    aria-hidden="true"
                    src={getCountryFlagUrl(country)}
                    alt=""
                    width={20}
                    height={15}
                    loading="lazy"
                    className="mr-2.5 inline-block rounded-[2px]"
                  />
                )}
                {country}
              </li>
            ))}
          </ul>
        )}

        {/* No results */}
        {isOpen && isEditing && search && filtered.length === 0 && (
          <div
            className={`absolute z-50 mt-2 w-full rounded-xl border px-4 py-3 font-sans text-[14px] ${
              white
                ? "border-black/[0.08] bg-white text-[#6b6678] shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
                : "border-white/10 bg-[#1a1225] text-white/40"
            }`}
          >
            No countries found
          </div>
        )}
      </div>
    </div>
  );
};

export default CountryQuestion;
