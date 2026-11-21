"use client";

import { fmt } from "@features/admin/server/ap/format";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import type { SurveyPayload } from "@features/admin/server/ap/survey-page";
import { SURVEY_SHEET_IDS } from "@features/survey/surveySheets";

import { Info } from "./field-info";
import { AllTraffic, Card, SectionHead, StatBox, TileGrid } from "./kit";
import { SHEET_NAMES, sheetBounce, sheetConversion, sheetNumber, sheetSpots } from "./sheets";
import { overFive } from "./SurveyTimeDrop";

/** The table's columns, as drawn: badge and name, where it sits, then the four figures. */
const GRID = "minmax(220px,2fr) minmax(220px,2fr) 88px 104px 104px 120px";

/**
 * Mark's Sheets section (Survey copy board, 17–18 Nov 2026), above the core demographics: the
 * sheets between the questions, each with how many it opened for, how many left the survey on
 * it, how long it stays open and, for the one with something to tap, its conversion. From the
 * sheets' own events in PostHog; where each sits is the order picked above.
 */
export default function SheetsSection({
  data,
  rows,
  order,
}: {
  data: SurveyPayload;
  /** The question funnel's rows in the order picked, for where each sheet sits. */
  rows: QuestionRow[];
  /** That order: the sheets' figures are its runs', as the funnel's are. */
  order: "survey" | "test";
}) {
  const { on, seen, from } = data.sheets;
  const spots = new Map(sheetSpots(rows).map((s) => [s.id, s]));
  const asked = rows.filter((r) => r.n > 0);
  const figures = seen?.ok ? seen.value[order] : null;
  // Without the questions (their read failed) there is nothing to place a sheet against.
  const placed = asked.length > 0;
  const all = figures?.all;
  const tapped = figures?.bySheet.desire;
  return (
    <Card id="sheets" labelledBy="h-sheets">
      <SectionHead id="h-sheets" title="Sheets" info="survey.sheets" />
      <AllTraffic
        note={
          data.narrowed &&
          "The sheets are all traffic's whatever the filters: their events carry no source or device."
        }
      />
      {seen === null ? (
        <p className="m-0 text-sm text-ap-muted">
          The sheets went live on 17 Nov 2026: pick a range that reaches that day.
        </p>
      ) : !seen.ok ? (
        <p className="m-0 text-sm text-ap-bad-ink">{seen.error}</p>
      ) : (
        <>
          <TileGrid min={180}>
            <StatBox
              stat={{
                label: "Sheets in the survey",
                unit: "count",
                value: on ? on.length : null,
                info: "survey.sheetsOn",
              }}
            />
            <StatBox
              stat={{
                label: "Bounce rate",
                unit: "pct",
                value: sheetBounce(all),
                info: "survey.sheetBounce",
              }}
            />
            <StatBox
              stat={{
                label: "Median time",
                unit: "mmss",
                value: all?.medianMs ?? null,
                info: "survey.sheetTime",
              }}
            />
            <StatBox
              stat={{
                label: "Conversion",
                unit: "pct",
                value: sheetConversion(tapped),
                info: "survey.sheetConversion",
                note: tapped ? clicks(tapped.ticked) : undefined,
              }}
            />
          </TileGrid>
          {from && (
            <p className="m-0 text-xs text-ap-muted">
              Read from {from}, when the first sheets went live.
            </p>
          )}
          <div className="overflow-x-auto rounded-[14px] border border-ap-line">
            <div role="table" aria-label="Sheets between the questions" style={{ minWidth: 900 }}>
              <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: GRID }}>
                <Head label="Sheet" />
                <Head label="Where it sits" />
                <Head label="Saw it" info="survey.sheetSaw" right />
                <Head label="Bounce rate" info="survey.sheetBounce" right />
                <Head label="Median time" info="survey.sheetTime" right />
                <Head label="Conversion" info="survey.sheetConversion" right />
              </div>
              {SURVEY_SHEET_IDS.map((id) => {
                const meta = SHEET_NAMES[id];
                const f = figures?.bySheet[id];
                const spot = spots.get(id);
                const q = spot ? asked[spot.q] : undefined;
                const bounce = sheetBounce(f);
                const off = on !== null && !on.includes(id);
                return (
                  <div
                    key={id}
                    role="row"
                    className="grid items-center border-t border-ap-line bg-white"
                    style={{ gridTemplateColumns: GRID }}
                  >
                    <span
                      role="rowheader"
                      title={meta.kind}
                      className="flex items-center gap-2.5 px-3 py-2.5"
                    >
                      <SheetBadge n={sheetNumber(id)} />
                      <span className="flex flex-col gap-px">
                        <span className="text-[13px] font-bold leading-snug text-ap-ink">
                          {meta.name}
                        </span>
                        {off && <span className="text-[11px] text-ap-muted">Switched off now</span>}
                      </span>
                    </span>
                    <span role="cell" className="flex flex-col gap-px px-3 py-2.5">
                      <span className="text-[13px] font-semibold text-ap-ink">
                        {spot ? spot.where : placed ? "Not in this order" : "—"}
                      </span>
                      <span className="text-[11px] leading-snug text-ap-muted">
                        {q
                          ? `${q.id} · ${q.text}`
                          : placed
                            ? "Its question is not asked here, or comes too early: it never opens."
                            : ""}
                      </span>
                    </span>
                    <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                      {fmt("count", f ? f.saw : 0)}
                    </span>
                    <span
                      role="cell"
                      className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${overFive(bounce) ? "font-bold text-ap-bad" : "text-ap-body"}`}
                    >
                      {fmt("pct", bounce)}
                    </span>
                    <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                      {fmt("mmss", f?.medianMs ?? null)}
                    </span>
                    <span role="cell" className="flex flex-col items-end gap-px px-3 py-2.5">
                      {meta.tap ? (
                        <>
                          <span className="text-[13px] font-semibold tabular-nums">
                            {fmt("pct", sheetConversion(f))}
                          </span>
                          <span className="text-[11px] text-ap-muted">
                            {clicks(f?.ticked ?? 0)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[13px] text-ap-muted">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** "1 click", "3 clicks". */
export const clicks = (n: number) => `${fmt("count", n)} ${n === 1 ? "click" : "clicks"}`;

/** A sheet's number in a small round badge, as on the charts and in the funnel. */
export function SheetBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#bf66d9] to-[#795fc8] text-[11px] font-bold text-white"
    >
      {n}
    </span>
  );
}

function Head({ label, info, right = false }: { label: string; info?: string; right?: boolean }) {
  return (
    <span
      role="columnheader"
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${right ? "text-right" : ""}`}
    >
      {label}
      {info && (
        <>
          {" "}
          <Info k={info} label={label} />
        </>
      )}
    </span>
  );
}
