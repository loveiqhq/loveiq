"use client";

import { useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { GradientButton } from "./MiraShell";

export type Style = Partial<
  Record<"guidance" | "challenge" | "depth" | "practical" | "tone", number>
>;

type Scale = { key: keyof Style; label: string; left: string; right: string };
const SCALES = miraConfig.styleScales as Scale[];

/** Board 03 "How Mira coaches you": five lines, the middle is balanced. */
export function StyleScales({ value, onChange }: { value: Style; onChange: (v: Style) => void }) {
  return (
    <div className="flex flex-col divide-y divide-ap-line rounded-2xl border border-ap-line px-4">
      {SCALES.map((s) => {
        const v = value[s.key] ?? 3;
        return (
          <fieldset key={s.key} className="py-3">
            <legend className="text-[14px] font-bold">{s.label}</legend>
            <div role="radiogroup" aria-label={s.label} className="mt-1 flex justify-between">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === v}
                  aria-label={`${s.label} ${n} of 5`}
                  onClick={() => onChange({ ...value, [s.key]: n })}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <span
                    className={`rounded-full border-2 ${n === v ? "h-5 w-5 border-ap-purple bg-ap-purple" : "h-3.5 w-3.5 border-[#c9bfe6] bg-white"}`}
                  />
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className={v < 3 ? "text-ap-ink" : "text-ap-muted"}>{s.left}</span>
              <span className={`text-right ${v > 3 ? "text-ap-ink" : "text-ap-muted"}`}>
                {s.right}
              </span>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function CoachingStylePanel({
  value,
  signedIn,
  onClose,
  onSave,
}: {
  value: Style;
  signedIn: boolean;
  onClose: () => void;
  onSave: (v: Style) => void;
}) {
  const [draft, setDraft] = useState<Style>(value);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Mira coaches you"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[24px] font-medium">How Mira coaches you</h2>
          <button
            type="button"
            onClick={() => setDraft({})}
            className="min-h-[44px] px-1 text-[13px] font-semibold text-ap-plum"
          >
            Reset
          </button>
        </div>
        <p className="mb-3 mt-1 text-[14px] text-ap-body">
          Pick a point on each line. The middle is balanced.
        </p>
        <StyleScales value={draft} onChange={setDraft} />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 text-[15px] font-semibold text-ap-plum"
          >
            Cancel
          </button>
          <GradientButton onClick={() => onSave(draft)}>
            {signedIn ? "Save" : "Save for this visit"}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}
