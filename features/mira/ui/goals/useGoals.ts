"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Goal, GoalPatch, GoalRow } from "../../server/goals";
import { miraApi, type ApiResult } from "../api";
import { useToday } from "../useToday";

export type { Goal };

/** minor: an account Mira stopped as under 18 (403 `minor`): the kit's AdultsOnly, no retry. */
type Load = "loading" | "ready" | "error" | "signed-out" | "minor";

const getGoals = () => miraApi<{ goals: Goal[] }>("/api/mira/goals");

/**
 * Challenges & goals in the browser: the person's goals from /api/mira/goals, and every change
 * to them. A tick shows at once and is put back if it doesn't save; the rest waits for the
 * server. Each change answers null, or the message to show.
 */
export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  // In the browser: the server's clock is not the person's, and a tab may stay open overnight.
  const { today, fresh } = useToday();
  // The goals whose tick is saving: each one's own, so ticks of two goals never wait or cross.
  const [ticking, setTicking] = useState<ReadonlySet<string>>(new Set());
  const saving = useRef(new Set<string>());

  const show = useCallback((r: ApiResult<{ goals: Goal[] }>) => {
    if (r.signedOut) return setLoad("signed-out");
    if (r.minor) return setLoad("minor");
    if (!r.ok || !Array.isArray(r.data.goals)) {
      setLoadError(r.data.error ?? "Your goals didn't load.");
      return setLoad("error");
    }
    setGoals(r.data.goals);
    setLoad("ready");
  }, []);

  useEffect(() => {
    void getGoals().then(show);
  }, [show]);

  /** "Try again" after a failed load. */
  function reload() {
    setLoad("loading");
    void getGoals().then(show);
  }

  const swap = (id: string, change: (g: Goal) => Goal) =>
    setGoals((all) => all.map((g) => (g.id === id ? change(g) : g)));

  /**
   * "Did it today", or taking it back, for today as it is at the tap (a tab left open since
   * yesterday ticks the new day). Shown at once and put back if it doesn't save. Null while this
   * goal's last tick is still saving: the tap is ignored, so two can't cross; other goals tick
   * meanwhile. Else what was done, and `saved`: null once saved, or the message to show.
   */
  function tick(goal: Goal): { done: boolean; saved: Promise<string | null> } | null {
    if (saving.current.has(goal.id)) return null;
    const day = fresh();
    const done = !goal.days.includes(day);
    const without = goal.days.filter((d) => d !== day);
    swap(goal.id, (g) => ({ ...g, days: done ? [day, ...without] : without }));
    const busy = (on: boolean) => {
      if (on) saving.current.add(goal.id);
      else saving.current.delete(goal.id);
      setTicking(new Set(saving.current));
    };
    busy(true);
    const saved = miraApi(`/api/mira/goals/${goal.id}/log`, { body: { day, done } }).then((r) => {
      busy(false);
      if (r.ok) return null;
      swap(goal.id, (g) => ({ ...g, days: goal.days }));
      return r.data.error ?? "That didn't save. Please try again.";
    });
    return { done, saved };
  }

  async function create(
    text: string,
    weeklyTarget: number | null,
    via: GoalRow["via"] = "hand"
  ): Promise<string | null> {
    const r = await miraApi<{ goal: Goal; existing?: boolean }>("/api/mira/goals", {
      body: { text, weeklyTarget, via },
    });
    if (!r.ok || !r.data.goal) return r.data.error ?? "Your goal didn't save. Please try again.";
    // The same words as a goal on the go answer that goal: never listed twice.
    const made = r.data.goal;
    setGoals((all) => (all.some((g) => g.id === made.id) ? all : [...all, made]));
    // Nothing was added or changed: said as it is, and the form keeps what was typed (R3-HAB-3).
    return r.data.existing
      ? "You already have this goal on the go. To change its days a week, use Edit on it above."
      : null;
  }

  async function update(goal: Goal, patch: GoalPatch): Promise<string | null> {
    const r = await miraApi<{ goal: GoalRow }>(`/api/mira/goals/${goal.id}`, {
      method: "PATCH",
      body: patch,
    });
    if (!r.ok || !r.data.goal) return r.data.error ?? "That didn't save. Please try again.";
    swap(goal.id, (g) => ({ ...g, ...r.data.goal, days: g.days }));
    return null;
  }

  async function remove(goal: Goal): Promise<string | null> {
    const r = await miraApi(`/api/mira/goals/${goal.id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) return r.data.error ?? "Unable to delete right now.";
    setGoals((all) => all.filter((g) => g.id !== goal.id));
    return null;
  }

  async function removeAll(): Promise<string | null> {
    const r = await miraApi("/api/mira/goals", { method: "DELETE" });
    if (!r.ok) return r.data.error ?? "Unable to delete right now.";
    setGoals([]);
    return null;
  }

  return {
    goals,
    load,
    loadError,
    today,
    ticking,
    reload,
    tick,
    create,
    update,
    remove,
    removeAll,
  };
}
