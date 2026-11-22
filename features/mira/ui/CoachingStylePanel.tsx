"use client";

import { useId, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { PrimaryButton } from "./MiraShell";
import { Modal } from "./SupportPanel";

export type Style = Partial<
  Record<"guidance" | "challenge" | "depth" | "practical" | "tone", number>
>;

type Scale = { key: keyof Style; label: string; left: string; right: string };
const SCALES = miraConfig.styleScales as Scale[];

/**
 * Board 03 "How Mira coaches you": five lines, the middle is balanced. Each line is a native radio
 * group (as the journal's check-in), so it is one Tab stop and the arrow keys move the choice; the
 * unselected points are ringed in muted, 4.5:1 on the page (round-2 audit A11Y-9 / CHAT-12).
 */
export function StyleScales({ value, onChange }: { value: Style; onChange: (v: Style) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col divide-y divide-ap-line rounded-2xl border border-ap-line px-4">
      {SCALES.map((s) => {
        const v = value[s.key] ?? 3;
        return (
          <fieldset key={s.key} className="py-3">
            {/* Floated: a legend is otherwise drawn in its fieldset's top border, here the
                divider above it (round-3 R3-CHAT-8). */}
            <legend className="float-left w-full text-[14px] font-bold">{s.label}</legend>
            <div className="clear-left flex justify-between pt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center"
                >
                  <input
                    type="radio"
                    name={`${id}-${s.key}`}
                    value={n}
                    checked={n === v}
                    onChange={() => onChange({ ...value, [s.key]: n })}
                    aria-label={`${s.label} ${n} of 5`}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ap-purple ${n === v ? "h-5 w-5 border-ap-purple bg-ap-purple" : "h-3.5 w-3.5 border-ap-muted bg-white"}`}
                  />
                </label>
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

/** `onSave` resolves to an error to show (the panel stays open), or null once saved. */
export function CoachingStylePanel({
  value,
  onClose,
  onSave,
}: {
  value: Style;
  onClose: () => void;
  onSave: (v: Style) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<Style>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal label="How Mira coaches you" onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2
          data-autofocus
          tabIndex={-1}
          className="font-serif text-[24px] font-medium outline-none"
        >
          How Mira coaches you
        </h2>
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
      {error ? (
        <p role="alert" className="mt-3 text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 text-[15px] font-semibold text-ap-plum"
        >
          Cancel
        </button>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const failed = await onSave(draft);
            if (failed) {
              setError(failed);
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
