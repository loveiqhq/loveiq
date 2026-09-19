import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRetrieve = vi.fn();
vi.mock("@features/brain/server/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/retrieve")>()),
  retrieve: (...a: unknown[]) => mockRetrieve(...a),
}));

const mockComplete = vi.fn();
vi.mock("@features/brain/server/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/llm")>()),
  isLlmConfigured: () => true,
  complete: (...a: unknown[]) => mockComplete(...a),
}));

import { answerQuestion } from "@features/brain/server/answer";
import { CorpusUnavailableError } from "@features/brain/server/retrieve";

describe("answerQuestion — an outage must not be reported as an empty corpus", () => {
  it("says the data is unreachable, and never 'I couldn't find anything'", async () => {
    mockRetrieve.mockRejectedValue(new CorpusUnavailableError("rpc 500"));

    const a = await answerQuestion({ question: "how much revenue in august" });

    expect(a.status).toBe("unavailable");
    expect(a.text).toMatch(/can't reach|outage/i);
    expect(a.text).not.toMatch(/couldn't find anything/i);
    expect(mockComplete).not.toHaveBeenCalled(); // no point spending a scarce LLM call
  });

  it("still says 'couldn't find anything' for a real empty result", async () => {
    mockRetrieve.mockResolvedValue([]);

    const a = await answerQuestion({ question: "what is our aws bill" });

    expect(a.status).toBe("no_results");
    expect(a.text).toMatch(/couldn't find anything/i);
  });
});
