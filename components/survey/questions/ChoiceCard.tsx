"use client";

import type { FC } from "react";

interface ChoiceCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}

const CheckIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3 w-3 text-white"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChoiceCard: FC<ChoiceCardProps> = ({
  label,
  description,
  selected,
  onClick,
  multi = false,
}) => {
  const hasDescription = Boolean(description?.trim());

  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex min-h-[60px] w-full justify-between gap-3 rounded-[16px] border px-[21px] text-left font-sans transition-[background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0510] ${
        hasDescription ? "items-start py-4 sm:py-[18px]" : "items-center py-3.5"
      } ${
        selected
          ? "border-[#fe6839] bg-[rgba(254,104,57,0.12)] shadow-[0_0_16px_rgba(254,104,57,0.1)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 pr-2">
        <span
          className={`text-[13px] font-medium leading-snug sm:text-[15px] ${
            selected ? "text-white" : "text-white/80"
          }`}
        >
          {label}
        </span>
        {hasDescription && (
          <span
            className={`text-[12px] font-light leading-[1.55] sm:text-[13px] ${
              selected ? "text-white/70" : "text-white/50"
            }`}
          >
            {description}
          </span>
        )}
      </span>

      <span
        className={`flex shrink-0 items-center justify-center transition-[background-color,box-shadow] duration-200 ${
          hasDescription ? "mt-1 self-start" : "self-center"
        } ${
          multi
            ? `h-5 w-5 rounded-[5px] ${
                selected
                  ? "bg-[#fe6839] shadow-[0_0_8px_rgba(254,104,57,0.3)]"
                  : "border-2 border-white/20 bg-transparent"
              }`
            : `h-5 w-5 rounded-full ${
                selected
                  ? "bg-[#fe6839] shadow-[0_0_8px_rgba(254,104,57,0.3)]"
                  : "border-2 border-white/20 bg-transparent"
              }`
        }`}
      >
        <span
          className={`transition-opacity duration-150 ${selected ? "opacity-100" : "opacity-0"}`}
        >
          <CheckIcon />
        </span>
      </span>
    </button>
  );
};

export default ChoiceCard;
