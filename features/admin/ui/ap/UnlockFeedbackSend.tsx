"use client";

import { useRef, useState } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import {
  SUBJECT_ARMS,
  subjectLabel,
  type SubjectArm,
} from "@features/unlock-feedback/logic/subjects";
import { getCsrfToken } from "@shared/http/csrf-client";
import { reportingDay } from "@shared/time/reporting-day";

import { BlackButton, Card, SectionHead } from "./kit";

/**
 * The admin's two sends on AP-Analytics › Unlock feedback (app/api/admin/ap/unlock-feedback/send),
 * while the hourly sends stay off: a test to the admin's own report, and a tranche to the newest
 * readers (Mark and Eman, 22.10: the first 250). A tranche is counted first (a dry run, nothing
 * sent), then sent only once the admin types "send <size>"; it runs in steps of about 40 seconds
 * and can be stopped between them.
 */

interface TrancheReply {
  batchSent: number;
  sent: number;
  eligible: number;
  failed: number;
  skipped: Record<string, number>;
  problems: string[];
  newestEligible: string | null;
  oldestEligible: string | null;
  nextBefore: string;
  done: boolean;
  exhausted: boolean;
  /** The call stopped after too many failed sends (MAX_FAILED_SENDS). */
  halted: boolean;
}

const SKIP_WORDS: Record<string, string> = {
  emailed_before: "had it already",
  paid: "bought",
  not_opened: "never opened the report",
  gate_cohort: "behind the €1.99 gate",
  test: "staff or test",
  suppressed: "unsubscribed or bounced",
  unknown: "unsubscribe list not readable",
  restricted: "processing restricted",
  no_email: "no address",
  no_archetype: "no archetype",
  already_claimed: "being sent by another run",
};

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin/ap/unlock-feedback/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  return json;
}

function skippedLine(skipped: Record<string, number>): string {
  const parts = Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${SKIP_WORDS[k] ?? k}`);
  return parts.length ? `Left out: ${parts.join(", ")}.` : "";
}

/** A report's Berlin day, as every AP page dates things. */
function day(at: string | null): string {
  return at ? shortDate(reportingDay(new Date(at))) : "?";
}

export default function UnlockFeedbackSend() {
  const [arm, setArm] = useState<SubjectArm>("A");
  const [testState, setTestState] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const [batch, setBatch] = useState("first-250");
  const [size, setSize] = useState(250);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"dry" | "send" | null>(null);
  const [dry, setDry] = useState<{
    batch: string;
    size: number;
    /** Sent under this name already: a tranche stopped part-way and picked up again. */
    already: number;
    eligible: number;
    newest: string | null;
    oldest: string | null;
    skipped: Record<string, number>;
    exhausted: boolean;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const stop = useRef(false);

  const sendTest = async () => {
    setTestBusy(true);
    setTestState(null);
    try {
      const r = await post({ mode: "test", arm });
      setTestState(
        `Sent to ${String(r.to)} with subject ${String(r.arm)}. Its links work until your next test.`
      );
    } catch (err) {
      setTestState(`Not sent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestBusy(false);
    }
  };

  const runDry = async () => {
    setBusy("dry");
    setFailure(null);
    setDry(null);
    setProgress(null);
    stop.current = false;
    let eligible = 0;
    let already = 0;
    let before: string | undefined;
    let newest: string | null = null;
    let oldest: string | null = null;
    const skipped: Record<string, number> = {};
    let exhausted = false;
    let finished = false;
    try {
      while (!stop.current) {
        const r = (await post({
          mode: "tranche",
          batch,
          size,
          dryRun: true,
          counted: eligible,
          ...(before ? { before } : {}),
        })) as unknown as TrancheReply;
        eligible += r.eligible;
        already = r.batchSent;
        newest ??= r.newestEligible;
        oldest = r.oldestEligible ?? oldest;
        for (const [k, n] of Object.entries(r.skipped)) skipped[k] = (skipped[k] ?? 0) + n;
        before = r.nextBefore;
        exhausted = r.exhausted;
        setProgress(`Counting… ${eligible} of ${size - already} found so far.`);
        if (r.done) {
          finished = true;
          break;
        }
      }
      // A count cut short is no count: the send stays locked until one finishes.
      if (!finished) {
        setProgress("Dry run stopped before it finished. Run it again to send.");
        return;
      }
      setDry({ batch, size, already, eligible, newest, oldest, skipped, exhausted });
      setProgress(null);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runSend = async () => {
    setBusy("send");
    setFailure(null);
    stop.current = false;
    let before: string | undefined;
    try {
      while (!stop.current) {
        const r = (await post({
          mode: "tranche",
          batch,
          size,
          dryRun: false,
          confirm,
          ...(before ? { before } : {}),
        })) as unknown as TrancheReply;
        before = r.nextBefore;
        const extra = r.failed
          ? ` ${r.failed} failed${r.problems.length ? ` (${r.problems[0]})` : ""}.`
          : "";
        setProgress(`Sent ${r.batchSent} of ${size}.${extra}`);
        if (r.halted) {
          setFailure(
            `${r.failed} sends failed${r.problems.length ? ` (${r.problems[0]})` : ""}. Check Resend, then send again: it carries on where it stopped.`
          );
          break;
        }
        if (r.done) {
          setProgress(
            `Done: ${r.batchSent} of ${size} sent${r.exhausted ? ", every eligible reader reached" : ""}.${extra}`
          );
          break;
        }
      }
      if (stop.current) setProgress((p) => `${p ?? ""} Stopped.`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmWords = `send ${size}`;
  const dryMatches = dry !== null && dry.batch === batch && dry.size === size;
  const canSend = dryMatches && confirm === confirmWords && busy === null;

  return (
    <Card id="send" labelledBy="h-send">
      <SectionHead
        id="h-send"
        eyebrow="Admins"
        title="Send the email"
        description="The hourly sends are off. A test goes to your own address; a tranche goes to the newest readers whose report is three hours old or more, who opened it, didn’t buy and never had this email: the hourly send’s own rules."
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex max-w-full items-center gap-2 text-sm text-ap-ink">
            Subject
            <select
              className="min-h-9 min-w-0 rounded-full border border-ap-line bg-white px-3 text-sm"
              value={arm}
              onChange={(e) => setArm(e.target.value as SubjectArm)}
            >
              {SUBJECT_ARMS.map((a) => (
                <option key={a} value={a}>
                  {a}: {subjectLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <BlackButton disabled={testBusy} onClick={() => void sendTest()}>
            {testBusy ? "Sending…" : "Send a test to me"}
          </BlackButton>
        </div>
        {testState && <p className="m-0 text-sm text-ap-body">{testState}</p>}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-ap-line pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-ap-ink">
            Tranche name
            <input
              className="min-h-9 rounded-full border border-ap-line bg-white px-3 text-sm"
              value={batch}
              onChange={(e) => setBatch(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              maxLength={40}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ap-ink">
            Readers
            <input
              type="number"
              min={1}
              max={500}
              className="min-h-9 w-28 rounded-full border border-ap-line bg-white px-3 text-sm"
              value={size}
              onChange={(e) => setSize(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          <BlackButton disabled={busy !== null || !batch} onClick={() => void runDry()}>
            {busy === "dry" ? "Counting…" : "Dry run (sends nothing)"}
          </BlackButton>
        </div>

        {dry && (
          <p className="m-0 text-sm text-ap-body">
            {dry.already > 0 && `${dry.already} already sent under this name. `}
            {dry.eligible >= dry.size - dry.already
              ? `Would go to ${dry.eligible} readers`
              : `Only ${dry.eligible} readers qualify`}
            {dry.eligible > 0 && `, reports from ${day(dry.oldest)} to ${day(dry.newest)}`}.{" "}
            {skippedLine(dry.skipped)}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-ap-ink">
            Type “{confirmWords}” to confirm
            <input
              className="min-h-9 w-56 rounded-full border border-ap-line bg-white px-3 text-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={!dryMatches}
            />
          </label>
          <BlackButton disabled={!canSend} onClick={() => void runSend()}>
            {busy === "send" ? "Sending…" : `Send to ${size} readers`}
          </BlackButton>
          {busy !== null && (
            <button
              type="button"
              className="min-h-9 rounded-full border border-ap-line bg-white px-4 text-sm font-bold text-ap-ink"
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop
            </button>
          )}
        </div>
        {!dryMatches && (
          <p className="m-0 text-xs text-ap-muted">
            Run the dry run for this name and size first; the send unlocks after it.
          </p>
        )}
        {progress && <p className="m-0 text-sm font-semibold text-ap-ink">{progress}</p>}
        {failure && <p className="m-0 text-sm text-ap-bad">Stopped: {failure}</p>}
      </div>
    </Card>
  );
}
