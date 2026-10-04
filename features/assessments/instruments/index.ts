import type { InstrumentDefinition } from "../logic/types";
import { bfne } from "./bfne";
import { gad7 } from "./gad7";
import { phq9 } from "./phq9";
import { rses } from "./rses";
import { scssf } from "./scssf";
import { ucla3 } from "./ucla3";
import { ucs } from "./ucs";

/** Every instrument in the factory. The test suite checks each one on every build. */
export const INSTRUMENTS: readonly InstrumentDefinition[] = [
  gad7,
  phq9,
  ucla3,
  scssf,
  rses,
  bfne,
  ucs,
];

export function instrument(id: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}
