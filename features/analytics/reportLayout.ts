/**
 * The report layout an event was seen on, so a dashboard can tell the readings before a
 * redesign from those after (Notion "Rework the report into the slimmed version", 16.10).
 * "v4_slim" is the slimmed report, the only V4 since; older layouts send no layout.
 *
 * A module of its own, not client.ts: the report's tests mock the client by hand, and a
 * constant read from a mocked module would have to be in every mock.
 */
export const REPORT_LAYOUT_V4_SLIM = "v4_slim";
export type ReportLayout = typeof REPORT_LAYOUT_V4_SLIM;
