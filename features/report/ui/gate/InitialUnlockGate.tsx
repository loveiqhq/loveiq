"use client";

import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";

export interface InitialUnlockGateProps {
  gate: InitialUnlockGatePayload;
  reportToken: string | null;
  reportSessionId: string | null;
}

/**
 * The EUR 1.99 pre-unlock gate (Figma Report-3.0 1604:2374), drawn by ReportPage in place of
 * the report for a reader the gate stops. A page of its own, never a pop-up over the report:
 * there is no report behind it.
 */
export default function InitialUnlockGate({ gate }: InitialUnlockGateProps) {
  return (
    <main className="iug-page" data-price-cents={gate.priceCents}>
      <h1>
        Find out your <em>Sexual Archetypes</em>
      </h1>
    </main>
  );
}
