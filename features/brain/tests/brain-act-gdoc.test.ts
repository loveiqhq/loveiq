import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));
const mockDelegated = vi.fn();
vi.mock("@shared/http/google-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/http/google-oauth")>()),
  getDelegatedToken: (...a: unknown[]) => mockDelegated(...(a as [])),
}));

import {
  appendToGoogleDoc,
  createGoogleDoc,
  DelegationNotGranted,
  docIdFrom,
  GoogleDocRefusal,
} from "@features/brain/server/act/gdoc";

const json = (body: Record<string, unknown>) => ({ ok: true, json: async () => body });

function wire(over: { folders?: Array<{ id: string; name: string }>; fail?: string } = {}) {
  mockFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (over.fail && u.includes(over.fail)) {
      return { ok: false, json: async () => ({ error: { message: "google said no" } }) };
    }
    if (u.includes("/documents") && init?.method === "POST" && !u.includes("batchUpdate")) {
      return json({ documentId: "doc-1" });
    }
    if (u.includes("batchUpdate")) return json({});
    if (u.includes("/documents/")) return json({ title: "Existing doc" });
    if (u.includes("/files?q="))
      return json({ files: over.folders ?? [{ id: "f1", name: "Notes" }] });
    if (u.includes("/files/")) return json({ id: "doc-1" });
    return { ok: false, json: async () => ({ error: { message: "unexpected" } }) };
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockDelegated.mockReset().mockResolvedValue("ya29.token");
  process.env.GOOGLE_WORKSPACE_ADMIN = "ec@loveiq.org";
  wire();
});

describe("reading a document reference", () => {
  it.each([
    ["1AbCdEfGhIjKlMnOpQrStUvWxYz012345", "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"],
    [
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
      "1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
    ],
    [
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?usp=sharing#heading=h.x",
      "1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
    ],
  ])("reads %j", (given, id) => {
    expect(docIdFrom(given)).toBe(id);
  });

  it.each([["not-an-id"], ["https://example.com/doc"], ["short"]])("refuses %j", (bad) => {
    expect(docIdFrom(bad)).toBeNull();
  });
});

describe("the Workspace grant", () => {
  /**
   * A MISSING GRANT IS AN ADMIN CONSOLE VISIT, NOT A RETRY. Reported as its own failure
   * so nobody spends an afternoon on the code — the scope is authorised by a person
   * against the service account's client id, and until then the exchange returns
   * `unauthorized_client` no matter what the code does.
   */
  it("names the admin console when the scope is not authorised", async () => {
    mockDelegated.mockResolvedValue(null);
    const err = await createGoogleDoc({ title: "x" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(DelegationNotGranted);
    expect((err as Error).message).toMatch(/Domain Wide Delegation/);
    expect((err as Error).message).toMatch(/116552495667268648554/);
    expect((err as Error).message).toMatch(/Nothing was written/);
  });

  /** Acting AS a person, so the document is owned by one and shareable normally rather
   *  than stranded in a service account's Drive where nobody can find it. */
  it("acts as the Workspace user, not as the service account", async () => {
    await createGoogleDoc({ title: "x" });
    expect(mockDelegated).toHaveBeenCalledWith(
      "ec@loveiq.org",
      "https://www.googleapis.com/auth/documents",
      expect.any(Number),
      undefined
    );
  });
});

describe("creating", () => {
  it("creates, writes the body, and returns a link a person can open", async () => {
    const r = await createGoogleDoc({ title: "August write-up", content: "Some prose." });
    expect(r.created).toBe(true);
    expect(r.url).toBe("https://docs.google.com/document/d/doc-1/edit");
    const update = mockFetch.mock.calls.find(([u]) => String(u).includes("batchUpdate"))!;
    const body = JSON.parse(String((update[1] as { body: string }).body));
    expect(body.requests[0].insertText.text).toBe("Some prose.");
  });

  /**
   * `endOfSegmentLocation` RATHER THAN AN INDEX. Docs' insertText takes a character
   * index, and an index computed from a stale read writes into the middle of someone
   * else's paragraph. This form means "the end of the body" and has nothing to compute.
   */
  it("appends at the end of the body, never at a computed index", async () => {
    await createGoogleDoc({ title: "x", content: "y" });
    const update = mockFetch.mock.calls.find(([u]) => String(u).includes("batchUpdate"))!;
    const req = JSON.parse(String((update[1] as { body: string }).body)).requests[0];
    expect(req.insertText.endOfSegmentLocation).toEqual({});
    expect(req.insertText).not.toHaveProperty("location");
  });

  /**
   * ABSENT AND EMPTY BOTH MEAN "no body", and only testing the absent one leaves the
   * check free to be `content !== undefined` — which sends a batchUpdate inserting an
   * empty string on every whitespace-only body. Found by mutation.
   */
  it.each([[undefined], [""], ["   \n  "]])(
    "writes nothing extra for a body of %j",
    async (content) => {
      await createGoogleDoc({ title: "empty", content });
      expect(mockFetch.mock.calls.some(([u]) => String(u).includes("batchUpdate"))).toBe(false);
    }
  );

  it("refuses a document with no title", async () => {
    await expect(createGoogleDoc({ title: "   " })).rejects.toThrow(GoogleDocRefusal);
  });

  it("files it into a folder found by name", async () => {
    const r = await createGoogleDoc({ title: "x", folder: "Notes" });
    expect(r.folder).toBe("Notes");
    const move = mockFetch.mock.calls.find(([u]) => String(u).includes("addParents"))!;
    expect(String(move[0])).toContain("addParents=f1");
  });

  it("refuses a folder name matching several, and lists their ids", async () => {
    wire({
      folders: [
        { id: "f1", name: "Notes" },
        { id: "f2", name: "Notes" },
      ],
    });
    const err = await createGoogleDoc({ title: "x", folder: "Notes" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/More than one/);
    expect((err as Error).message).toContain("f2");
  });

  it("refuses a folder that does not exist", async () => {
    wire({ folders: [] });
    await expect(createGoogleDoc({ title: "x", folder: "Nope" })).rejects.toThrow(
      /No Drive folder/
    );
  });

  /** A name with an apostrophe would close Drive's quoted query string and turn the rest
   *  of the name into query syntax. */
  it("escapes a quote in a folder name instead of building broken query syntax", async () => {
    await createGoogleDoc({ title: "x", folder: "Eman's notes" });
    // PARSED, not decodeURIComponent'd: the query is form-encoded, so a space arrives as
    // `+` and a naive decode leaves it there — the assertion would then fail for a
    // reason that has nothing to do with the escaping it is checking.
    const url = new URL(
      String(mockFetch.mock.calls.find(([u]) => String(u).includes("/files?"))![0])
    );
    expect(url.searchParams.get("q")).toContain("Eman\\'s notes");
  });

  /** Asking for the Drive scope when nothing needs filing would make a Docs-only grant
   *  fail on every create, for a folder the caller never named. Empty as well as absent. */
  it.each([[undefined], [""], ["  "]])(
    "does not ask for the Drive scope for a folder of %j",
    async (folder) => {
      await createGoogleDoc({ title: "x", folder });
      expect(mockDelegated.mock.calls.map((c) => c[1])).toEqual([
        "https://www.googleapis.com/auth/documents",
      ]);
    }
  );
});

describe("appending", () => {
  it("adds to an existing document and names it back", async () => {
    const r = await appendToGoogleDoc({
      document: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
      content: "One more paragraph.",
    });
    expect(r.created).toBe(false);
    expect(r.title).toBe("Existing doc");
    expect(r.id).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  });

  /** Read before write, so a wrong id fails before anything lands in a real document. */
  it("reads the document before writing to it", async () => {
    await appendToGoogleDoc({ document: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345", content: "x" });
    const order = mockFetch.mock.calls.map(([u]) =>
      String(u).includes("batchUpdate") ? "write" : "read"
    );
    expect(order.indexOf("read")).toBeLessThan(order.indexOf("write"));
  });

  it("refuses a reference that is not a document", async () => {
    await expect(appendToGoogleDoc({ document: "nope", content: "x" })).rejects.toThrow(
      /not a Google Docs id or link/
    );
  });

  it("refuses an empty addition", async () => {
    await expect(
      appendToGoogleDoc({ document: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345", content: "  " })
    ).rejects.toThrow(/nothing to add/);
  });

  it("surfaces Google's own message when it refuses", async () => {
    wire({ fail: "batchUpdate" });
    await expect(
      appendToGoogleDoc({ document: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345", content: "x" })
    ).rejects.toThrow(/google said no/);
  });
});
