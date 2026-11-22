"use client";

import { useState } from "react";
import { miraApi } from "../api";
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
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
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
    }
  }
  return (
    <div>
      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-ap-line p-4">
        <span>
          <span className="block text-[15px] font-bold">Mira may use my check results</span>
          <span className="text-[14px] text-ap-body">
            She sees each check&rsquo;s latest band, like &ldquo;mild&rdquo;, and whether your last
            mood check opened the support lines. Never your scores or other answers.
          </span>
        </span>
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-ap-purple"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Settings › Self-checks (the lead mounts it in MiraSettings): the "Mira may use" switch and
 * "Delete my check results", which deletes every result, the body check's included (the API also
 * does it for an under-18 stop). Loads its own data.
 */
export default function ChecksSettings() {
  const { data, error, setData, retry } = useChecks();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data) {
    return error ? (
      <section aria-labelledby="checks-settings-h" className="flex flex-col gap-3">
        <h2 id="checks-settings-h" className="font-serif text-[22px] font-medium">
          Self-checks
        </h2>
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}{" "}
          <button type="button" onClick={retry} className="font-semibold underline">
            Try again
          </button>
        </p>
      </section>
    ) : null;
  }
  const bodyChecks = data.bodyCheck?.taken.length ?? 0;
  const count = data.checks.reduce((n, c) => n + c.results.length, 0) + bodyChecks;

  async function remove() {
    setBusy(true);
    const r = await miraApi("/api/mira/checks", { method: "DELETE" });
    setBusy(false);
    setConfirm(false);
    if (!r.ok) {
      setStatus({ ok: false, text: r.data.error ?? "Unable to delete right now." });
      return;
    }
    setData(
      (d) =>
        d && {
          ...d,
          checks: d.checks.map((c) => ({ ...c, results: [], nextAt: null })),
          bodyCheck: d.bodyCheck && { taken: [], due: "baseline", nextAt: null },
        }
    );
    setStatus({ ok: true, text: "Your check results are deleted." });
  }

  return (
    <section aria-labelledby="checks-settings-h" className="flex flex-col gap-3">
      <h2 id="checks-settings-h" className="font-serif text-[22px] font-medium">
        Self-checks
      </h2>
      <UseChecksSwitch
        on={data.useChecks}
        onChange={(on) => setData((d) => d && { ...d, useChecks: on })}
      />
      {confirm ? (
        <div className="rounded-2xl border border-ap-bad p-4 text-[14px]">
          <p>
            {count === 1 ? "Delete your check result" : `Delete all ${count} of your check results`}
            {bodyChecks ? ", your body check included" : ""}? Your history and trends go too. This
            can&rsquo;t be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="min-h-[44px] rounded-full border border-ap-line px-5 font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={count === 0}
          onClick={() => {
            setStatus(null);
            setConfirm(true);
          }}
          className="min-h-[44px] w-fit rounded-full border border-ap-line px-5 text-[14px] font-semibold disabled:text-ap-quiet"
        >
          {count === 0 ? "No check results to delete" : "Delete my check results"}
        </button>
      )}
      <p
        role={status && !status.ok ? "alert" : "status"}
        className={`text-[14px] ${status?.ok === false ? "text-ap-bad-ink" : "text-ap-good-ink"}`}
      >
        {status?.text}
      </p>
    </section>
  );
}
