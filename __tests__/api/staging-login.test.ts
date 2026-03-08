import { describe, it, expect, vi, beforeEach } from "vitest";

import { POST } from "../../app/api/staging-login/route";

// --- Helpers ---

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/staging-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/staging-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STAGING_PASSWORD = "test-staging-pw";
  });

  it("returns 404 when STAGING_PASSWORD is not set", async () => {
    delete process.env.STAGING_PASSWORD;

    const res = await POST(makeRequest({ password: "anything" }));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Not found.");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 400 when password is not a string", async () => {
    const res = await POST(makeRequest({ password: 12345 }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 401 on wrong password", async () => {
    const res = await POST(makeRequest({ password: "wrong-password" }));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Incorrect password.");
  });

  it("returns 200 and sets staging_session cookie on correct password", async () => {
    const res = await POST(makeRequest({ password: "test-staging-pw" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("staging_session=");
  });

  it("returns 400 when body is malformed JSON", async () => {
    const req = new Request("http://localhost/api/staging-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
