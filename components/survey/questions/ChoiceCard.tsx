"use client";

import type { FC } from "react";

interface ChoiceCardProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}

const ChoiceCard: FC<ChoiceCardProps> = ({ label, selected, onClick, multi = false }) => {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex min-h-[68px] w-full items-center rounded-[14px] border px-4 py-3 text-left font-sans text-[15px] font-medium leading-snug text-white/80 transition-all duration-200 sm:text-[16px] ${
        selected
          ? "border-[#fe6839] bg-[rgba(254,104,57,0.15)] shadow-[0_0_20px_rgba(254,104,57,0.15)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
};

export default ChoiceCard;
