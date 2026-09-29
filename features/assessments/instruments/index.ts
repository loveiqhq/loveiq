import type { InstrumentDefinition } from "../logic/types";
import { gad7 } from "./gad7";
import { phq9 } from "./phq9";
import { ucla3 } from "./ucla3";

/** Every instrument in the factory. The test suite checks each one on every build. */
export const INSTRUMENTS: readonly InstrumentDefinition[] = [gad7, phq9, ucla3];

export function instrument(id: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}
