"use client";

import { useCallback, useEffect, useState } from "react";
import { localDay, type Day } from "../../server/goal-progress";
import type { Goal, GoalPatch, GoalRow } from "../../server/goals";
import { miraApi, type ApiResult } from "../api";

export type { Goal };

type Load = "loading" | "ready" | "error" | "signed-out";

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
  // Read with the goals, in the browser: the server's clock is not the person's.
  const [today, setToday] = useState<Day>("");
  const [ticking, setTicking] = useState<string | null>(null);

  const show = useCallback((r: ApiResult<{ goals: Goal[] }>) => {
    setToday(localDay(new Date()));
    if (r.status === 401) return setLoad("signed-out");
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

  /** "Did it today", or taking it back. One tick in flight at a time, so they can't cross. */
  async function tick(goal: Goal, done: boolean): Promise<string | null> {
    if (ticking) return null;
    const day = localDay(new Date());
    setToday(day);
    const without = goal.days.filter((d) => d !== day);
    swap(goal.id, (g) => ({ ...g, days: done ? [day, ...without] : without }));
    setTicking(goal.id);
    const r = await miraApi(`/api/mira/goals/${goal.id}/log`, { body: { day, done } });
    setTicking(null);
    if (r.ok) return null;
    swap(goal.id, (g) => ({ ...g, days: goal.days }));
    return r.data.error ?? "That didn't save. Please try again.";
  }

  async function create(
    text: string,
    weeklyTarget: number | null,
    via: GoalRow["via"] = "hand"
  ): Promise<string | null> {
    const r = await miraApi<{ goal: Goal }>("/api/mira/goals", {
      body: { text, weeklyTarget, via },
    });
    if (!r.ok || !r.data.goal) return r.data.error ?? "Your goal didn't save. Please try again.";
    setGoals((all) => [...all, r.data.goal]);
    return null;
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
