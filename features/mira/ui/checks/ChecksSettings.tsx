"use client";

import { useId, useRef, useState } from "react";
import { miraApi } from "../api";
import { SignInAgain } from "../account/SignedOut";
import { AskFirst, Switch, refocus } from "../journal/parts";
import { SettingsSection } from "../MiraSettings";
import { AdultsOnly } from "../kit";
import { useChecks } from "./data";

/**
 * "Mira may use my check results" (mira_user.use_checks, off by default), one of the "What Mira
 * may use" switches (PATCH /api/mira/me): saved on change, put back if the save fails. Mira then
 * sees each check's latest band and whether the mood check's question 9 opened the support lines
 * (server/checks.ts checksForMira), never scores or other answers.
 */
export function UseChecksSwitch({
  on,
  onChange,
  onSaved,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Settings says "Saved" beside its section. */
  onSaved?: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function toggle(next: boolean) {
    setError(null);
    setBusy(true);
    onChange(next);
    const r = await miraApi("/api/mira/me", { method: "PATCH", body: { use_checks: next } });
    setBusy(false);
    if (!r.ok) {
      onChange(!next);
      setError(r.data.error ?? "Unable to save. Please try again.");
    } else onSaved?.();
  }
  return (
    <div>
      <SwitchRow
        id={id}
        label="Mira may use my check results"
        description="She sees each check’s latest band, like “mild”, and whether your last mood check opened the support lines. Never your scores or other answers."
        checked={on}
        busy={busy}
        onChange={(next) => void toggle(next)}
      />
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
          {error}
          <SignInAgain error={error} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * An on/off choice as Settings shows every one (round-2 decision 6): its name and what it means,
 * with the journal's switch beside them, which keeps focus and ignores taps while it saves.
 */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  busy,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-ap-line p-4">
      <span>
        <span id={`${id}-l`} className="block text-[15px] font-bold">
          {label}
        </span>
        <span id={`${id}-d`} className="text-[14px] text-ap-body">
          {description}
        </span>
      </span>
      <Switch
        checked={checked}
        disabled={busy}
        onChange={onChange}
        labelledBy={`${id}-l`}
        describedBy={`${id}-d`}
      />
    </div>
  );
}

/**
 * Settings › Assessments (Settings' own SettingsSection, as its index names it): the "Mira may use" switch and
 * "Delete my check results", which deletes every result, the body check's included (the API also
 * does it for an under-18 stop). Loads its own data.
 */
export default function ChecksSettings() {
  const { data, error, minor, setData, retry } = useChecks();
  // Beside the heading, as Settings says it for every section: "Saved", or what was deleted.
  const [status, setStatus] = useState<{ kind: "saved"; text?: string } | undefined>();
  const none = useRef<HTMLButtonElement | null>(null);
  if (!data) {
    return error ? (
      <SettingsSection id="checks-settings" title="Assessments">
        {minor ? (
          <AdultsOnly />
        ) : (
          <p role="alert" className="text-[14px] text-ap-bad-ink">
            {error}{" "}
            <button type="button" onClick={retry} className="font-semibold underline">
              Try again
            </button>
          </p>
        )}
      </SettingsSection>
    ) : null;
  }
  const bodyChecks = data.bodyCheck?.taken.length ?? 0;
  const count = data.checks.reduce((n, c) => n + c.results.length, 0) + bodyChecks;

  /** "Delete" once asked: null, or the message the question shows. */
  async function remove(): Promise<string | null> {
    setStatus(undefined);
    const r = await miraApi("/api/mira/checks", { method: "DELETE" });
    if (!r.ok) return r.data.error ?? "Unable to delete right now.";
    setData(
      (d) =>
        d && {
          ...d,
          checks: d.checks.map((c) => ({ ...c, results: [], nextAt: null })),
          bodyCheck: d.bodyCheck && { taken: [], due: "baseline", nextAt: null },
        }
    );
    setStatus({ kind: "saved", text: "Your check results are deleted." });
    // The question goes with the results: focus goes to what took its place (R3-HAB-4).
    refocus(() => none.current);
    return null;
  }

  return (
    <SettingsSection id="checks-settings" title="Assessments" status={status}>
      <div className="flex flex-col gap-3">
        <UseChecksSwitch
          on={data.useChecks}
          onChange={(on) => {
            setStatus(undefined);
            setData((d) => d && { ...d, useChecks: on });
          }}
          onSaved={() => setStatus({ kind: "saved" })}
        />
        {count === 0 ? (
          // Never `disabled` (decision 7): focus lands here after a delete.
          <button
            ref={none}
            type="button"
            aria-disabled="true"
            className="min-h-[44px] w-fit cursor-default rounded-full border border-ap-line px-5 text-[14px] font-semibold text-ap-muted"
          >
            No check results to delete
          </button>
        ) : (
          <AskFirst
            label="Delete my check results"
            question={`${count === 1 ? "Delete your check result" : `Delete all ${count} of your check results`}${bodyChecks ? ", your body check included" : ""}? Your history and trends go too. This can’t be undone.`}
            className="min-h-[44px] w-fit rounded-full border border-ap-line px-5 text-[14px] font-semibold"
            run={remove}
          />
        )}
      </div>
    </SettingsSection>
  );
}
