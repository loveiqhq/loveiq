"use client";

import { fmt } from "@features/admin/server/ap/format";
import type { JournalFigures } from "@features/admin/server/ap/mira-journal";

import { Card, SectionHead, StatBox } from "./kit";

const share = (a: number, b: number) => (b ? a / b : null);
const n = (v: number) => fmt("count", v);

/**
 * AP › Mira › Engagement & retention: the daily journal (features/admin/server/ap/mira-journal.ts).
 * Nothing shows for a page payload without it.
 */
export function ApMiraJournal({ journal: j }: { journal?: JournalFigures }) {
  if (!j) return null;
  const read = (v: number | null) => (j.read ? v : null);
  return (
    <Card id="journal" labelledBy="h-journal">
      <SectionHead
        id="h-journal"
        level={3}
        title="Journal"
        description="Whether people keep the daily check-in: who checks in, who comes back a week later, how long their runs get, and who asked for the reminder or lets Mira read it."
      />
      {j.read ? null : (
        <p className="m-0 text-sm text-ap-bad-ink">
          The journal could not be read just now: these figures are missing, not zero.
        </p>
      )}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{
            label: "Checked in at least once",
            unit: "count",
            value: read(j.journalers),
            note: `${n(j.checkIns)} check-ins in the range`,
          }}
        />
        <StatBox
          stat={{
            label: "D7 check-in retention",
            unit: "pct",
            value: read(share(j.d7.returned, j.d7.of)),
            note: j.d7.of
              ? `${n(j.d7.returned)} of ${n(j.d7.of)} back on day 7 or later`
              : "nobody’s day 7 falls in the range yet",
          }}
        />
        <StatBox
          stat={{
            label: "Average streak",
            unit: "days",
            value: read(j.avgStreak),
            note: "longest run in a row, per person",
          }}
        />
        <StatBox
          stat={{
            label: "Reminder on",
            unit: "pct",
            value: read(share(j.reminders, j.accounts)),
            note: `${n(j.reminders)} of ${n(j.accounts)} accounts, today`,
          }}
        />
        <StatBox
          stat={{
            label: "Lets Mira read it",
            unit: "pct",
            value: read(share(j.sharing, j.accounts)),
            note: `${n(j.sharing)} of ${n(j.accounts)} accounts, ${n(j.notes)} with notes, today`,
          }}
        />
      </div>
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Checked in: people with a check-in in the range (a check-in&rsquo;s day is its
        person&rsquo;s own calendar day). D7: of the people whose first check-in ever was in the
        range and at least 7 days before its last day, the share who checked in again on day 7 or
        later, by that day. Average streak: each of the range&rsquo;s people&rsquo;s longest run of
        days in a row in the range. Reminder and Mira reading it: today&rsquo;s settings, of
        today&rsquo;s accounts, whatever the range. Only days and settings are read, never a rating
        or a note; a deleted entry or account leaves the counts. The team is left out as above.
        Counted from the day the journal went live.
      </p>
    </Card>
  );
}
