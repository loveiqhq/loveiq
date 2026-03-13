"use client";

import type { FC } from "react";

interface ChoiceCardProps {
  label: string;
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

const ChoiceCard: FC<ChoiceCardProps> = ({ label, selected, onClick, multi = false }) => {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[16px] border px-[21px] py-3.5 text-left font-sans text-[13px] font-medium leading-snug transition-all duration-200 sm:rounded-[16px] sm:px-4 sm:text-[15px] ${
        selected
          ? "border-[#fe6839] bg-[rgba(254,104,57,0.12)] text-white shadow-[0_0_16px_rgba(254,104,57,0.1)]"
          : "border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      {/* Label text */}
      <span className="flex-1">{label}</span>

      {/* Radio circle or Checkbox square — on the right */}
      <span
        className={`flex shrink-0 items-center justify-center transition-all duration-200 ${
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
        {selected && <CheckIcon />}
      </span>
    </button>
  );
};

export default ChoiceCard;
