import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));

import { readGateSeen } from "@features/admin/server/ap/gate-seen";
import { FIELDS } from "@features/admin/ui/ap/fields";

describe("AP: who saw the €1.99 page", () => {
  beforeEach(() => {
    mockFetchAllRows.mockReset();
  });

  it("reads who saw the €1.99 page from the range's first day, null when it can't", async () => {
    mockFetchAllRows.mockResolvedValueOnce([
      { survey_submission_id: 4 },
      { survey_submission_id: 7 },
    ]);
    expect(await readGateSeen("2026-10-20")).toEqual(new Set([4, 7]));
    expect(String(mockFetchAllRows.mock.calls[0]![0])).toBe(
      "/rest/v1/personal_report?initial_gate_seen_at=gte." +
        encodeURIComponent("2026-10-19T22:00:00.000Z") +
        "&select=survey_submission_id&order=id.asc"
    );
    mockFetchAllRows.mockResolvedValueOnce(null);
    expect(await readGateSeen("2026-10-20")).toBeNull();
  });

  // As on every AP number: its info card's query counts it as the page does.
  it("shows Pay to start's way back from the €1.99 page in its query", () => {
    expect(FIELDS["pts.step-gate"]!.query.text).toContain(
      "AND a.event_type = 'initial_gate_browser_back')) AS pressed_browser_back"
    );
  });
});
