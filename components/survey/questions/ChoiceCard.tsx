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
    className="h-4 w-4 text-white"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3.4 8.15 2.45 2.45 6-6" />
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
      className={`relative flex min-h-[68px] w-full gap-[28px] rounded-[16px] border px-[21px] text-left font-sans transition-[background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0510] ${
        hasDescription ? "items-start py-4" : "items-center py-px"
      } ${
        selected
          ? "border-[rgba(254,104,57,0.5)] bg-[rgba(254,104,57,0.1)] shadow-[0_0_20px_rgba(254,104,57,0.15)]"
          : "border-white/10 bg-white/[0.05] hover:border-white/15 hover:bg-white/[0.07]"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-[2px] py-[4px] pr-2">
        <span
          className={`text-[16px] font-medium leading-[26px] ${
            selected ? "text-white" : "text-white/70"
          }`}
        >
          {label}
        </span>
        {hasDescription ? (
          <span
            className={`text-[13px] font-light leading-[21px] ${
              selected ? "text-white/60" : "text-white/45"
            }`}
          >
            {description}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center ${
          hasDescription ? "mt-1" : "self-center"
        }`}
      >
        {multi ? (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-[8px] transition-[background-color,border-color,box-shadow] duration-200 ${
              selected
                ? "bg-[#fe6839] text-white shadow-[0_0_10px_rgba(254,104,57,0.5)]"
                : "h-5 w-5 rounded-[8px] border-2 border-white/20 bg-transparent text-transparent"
            }`}
          >
            {selected ? <CheckIcon /> : null}
          </span>
        ) : (
          <span
            className={`flex items-center justify-center rounded-full transition-[background-color,border-color,box-shadow] duration-200 ${
              selected
                ? "h-6 w-6 border border-[#fe6839]/70 bg-[#fe6839] shadow-[0_0_10px_rgba(254,104,57,0.35)]"
                : "h-5 w-5 border-2 border-white/20 bg-transparent"
            }`}
          >
            <span
              className={`rounded-full bg-white transition-[width,height,opacity] duration-200 ${
                selected ? "h-2.5 w-2.5 opacity-100" : "h-0 w-0 opacity-0"
              }`}
            />
          </span>
        )}
      </span>
    </button>
  );
};

export default ChoiceCard;
