/**
 * Every AP-Analytics field's definition, by key ("traffic.visitors"): one file per page, each
 * key written once. A key used on a page and missing here shows a grey icon, "Not defined yet".
 */
import { fields as assessment } from "./assessment";
import { fields as data } from "./data";
import { fields as focus } from "./focus";
import { fields as landing } from "./landing";
import { fields as payment } from "./payment";
import { fields as report } from "./report";
import { fields as survey } from "./survey";
import { fields as traffic } from "./traffic";
import type { FieldRegistry } from "./types";

export const FIELDS: FieldRegistry = {
  ...focus,
  ...assessment,
  ...traffic,
  ...landing,
  ...survey,
  ...report,
  ...payment,
  ...data,
};
