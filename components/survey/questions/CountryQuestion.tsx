"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { COUNTRIES } from "@/data/countries";

interface CountryQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
}

const CountryQuestion: FC<CountryQuestionProps> = ({ question, value, onChange }) => {
  // search tracks user typing only while dropdown is open
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Display: when editing show search text, otherwise show selected value
  const displayValue = isEditing ? search : (value ?? "");

  // Filter uses search text when editing, otherwise shows all
  const filterText = isEditing ? search : "";
  const filtered = useMemo(
    () =>
      filterText
        ? COUNTRIES.filter((c) => c.toLowerCase().includes(filterText.toLowerCase()))
        : COUNTRIES,
    [filterText]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    setHighlightIndex(-1);
    if (value) onChange("" as string);
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
          selectCountry(filtered[highlightIndex]);
        } else if (filtered.length === 1) {
          selectCountry(filtered[0]);
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
    <div className="flex flex-col gap-6">
      <h2 className="font-sans text-[28px] font-bold leading-tight text-white sm:text-[36px]">
        {question.question}
      </h2>

      <div ref={containerRef} className="relative">
        {/* Search input */}
        <div className="relative">
          {/* Search icon */}
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search for a country..."
            autoComplete="off"
            className={`w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 font-sans text-[15px] text-white placeholder:text-white/30 focus:border-[#a78bfa] focus:outline-none ${value ? "pr-10" : "pr-4"}`}
          />

          {/* Clear button */}
          {value && (
            <button
              type="button"
              onClick={clearSelection}
              className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white"
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
            className="absolute z-50 mt-2 max-h-[240px] w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1a1225] py-1"
            role="listbox"
          >
            {filtered.map((country, i) => (
              <li
                key={country}
                role="option"
                aria-selected={country === value}
                className={`cursor-pointer px-4 py-2.5 font-sans text-[15px] text-white/80 transition-colors ${
                  i === highlightIndex ? "bg-white/[0.1] text-white" : "hover:bg-white/[0.07]"
                } ${country === value ? "text-[#a78bfa]" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCountry(country);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                {country}
              </li>
            ))}
          </ul>
        )}

        {/* No results */}
        {isOpen && isEditing && search && filtered.length === 0 && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#1a1225] px-4 py-3 font-sans text-[14px] text-white/40">
            No countries found
          </div>
        )}
      </div>
    </div>
  );
};

export default CountryQuestion;
