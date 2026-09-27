// Live end-to-end check of Jarvis per-person sign-in against production.
// Usage: node scripts/jarvis-sign-in-e2e.mjs <member-email>   (a real member; they get one sign-in code email)
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (to read a code without an inbox).
import { createHash, randomBytes } from "node:crypto";

const SITE = "https://www.loveiq.org";
const SUPA = process.env.SUPABASE_URL.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.argv[2];
const REDIRECT = "http://localhost:8976/callback";
let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
  return ok;
};

// A tiny cookie jar for the browser half of the flow.
const jar = new Map();
const keep = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1);
    if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const browser = async (url, init = {}) => {
  const res = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: { ...(init.headers ?? {}), cookie: cookie() },
  });
  keep(res);
  return res;
};
const csrf = () => jar.get("__Host-csrf") ?? jar.get("__csrf") ?? "";
const postJson = (path, body) =>
  browser(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf() },
    body: JSON.stringify(body),
  });
const mcp = (token, body, extra = {}) =>
  fetch(`${SITE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-loveiq-mcp-client": "battery",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
const admin = (path, init = {}) =>
  fetch(`${SUPA}${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

// Whatever happens below, the apps this registers are removed and its session signed out:
// a step that throws used to skip the tidy-up and leave apps named "Claude" in production.
const registered = [];
let openSession = null;
try {
  // 1. Discovery, as Claude does it.
  const bare = await mcp(null, { method: "ping" });
  const challenge = bare.headers.get("www-authenticate") ?? "";
  check(bare.status === 401, "no token is a 401", String(bare.status));
  const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  check(Boolean(prmUrl), "the 401 names the sign-in document", challenge);
  const prm = await (await fetch(prmUrl)).json();
  check(prm.resource === `${SITE}/api/mcp`, "the document names this resource", prm.resource);
  const as = prm.authorization_servers?.[0];
  check(as === `${SUPA}/auth/v1`, "and Supabase as the sign-in server", as);
  const meta = await (await fetch(`${SUPA}/.well-known/oauth-authorization-server/auth/v1`)).json();
  check(
    Boolean(meta.registration_endpoint),
    "Supabase allows registration",
    meta.registration_endpoint
  );

  // 2. Register, as Claude Code would, and a stranger's client for the refusal.
  const register = async (name, ...redirects) => {
    const r = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: redirects,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    const j = await r.json();
    check(r.ok && j.client_id, `registered "${name}"`, r.ok ? "" : JSON.stringify(j).slice(0, 200));
    if (j.client_id) registered.push(j.client_id);
    return j.client_id;
  };
  const clientId = await register("Jarvis protocol test", REDIRECT);
  const strangerId = await register("Claude", "https://evil.example/cb");

  const verifier = randomBytes(32).toString("base64url");
  const challengeS256 = createHash("sha256").update(verifier).digest("base64url");
  const authorize = async (id, redirect) => {
    const url = new URL(meta.authorization_endpoint);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: id,
      redirect_uri: redirect,
      state: "st4te",
      code_challenge: challengeS256,
      code_challenge_method: "S256",
      scope: "email",
    }))
      url.searchParams.set(k, v);
    const r = await fetch(url, { redirect: "manual" });
    const to = r.headers.get("location") ?? "";
    return { status: r.status, to, authId: new URL(to, SITE).searchParams.get("authorization_id") };
  };
  const auth1 = await authorize(clientId, REDIRECT);
  check(
    auth1.to.startsWith(`${SITE}/jarvis/connect?authorization_id=`),
    "Supabase sends the person to /jarvis/connect",
    `${auth1.status} ${auth1.to.slice(0, 90)}`
  );

  // 3. The page, signed out, then signing in with a real code.
  const page0 = await browser(auth1.to);
  const html0 = await page0.text();
  check(
    page0.status === 200 && html0.includes("Send code"),
    "signed out, the page asks for an email"
  );
  check(Boolean(csrf()), "and sets the CSRF cookie");
  const sent = await postJson("/api/jarvis/sign-in", { email: EMAIL });
  check(sent.status === 200, "a member is sent a code", `${sent.status} ${await sent.text()}`);
  const stranger = await postJson("/api/jarvis/sign-in", { email: "nobody-here@loveiq.org" });
  check(stranger.status === 200, "a non-member gets the same answer", String(stranger.status));
  // Read a code without an inbox: mint a fresh one, which replaces the emailed one.
  const link = await (
    await admin("/auth/v1/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "magiclink", email: EMAIL }),
    })
  ).json();
  const bad = await postJson("/api/jarvis/verify", { email: EMAIL, code: "000000" });
  check(bad.status === 400, "a wrong code is refused", String(bad.status));
  const ok = await postJson("/api/jarvis/verify", { email: EMAIL, code: link.email_otp });
  check(ok.status === 200, "the right code signs in", `${ok.status} ${await ok.text()}`);

  // 4. Consent, and the refusal for a stranger's client.
  const page1 = await browser(auth1.to);
  const html1 = await page1.text();
  check(
    html1.includes("Jarvis protocol test") && html1.includes("Allow"),
    "signed in, the page asks to allow the app"
  );
  const stranger1 = await authorize(strangerId, "https://evil.example/cb");
  const refusedPage = await (await browser(stranger1.to)).text();
  check(
    refusedPage.includes("connects only to Claude"),
    "a stranger's client is refused on the page"
  );
  const refused = await postJson("/api/jarvis/decision", {
    authorization_id: stranger1.authId,
    decision: "approve",
  });
  check(refused.status === 400, "and its approval is refused", String(refused.status));
  const decided = await postJson("/api/jarvis/decision", {
    authorization_id: auth1.authId,
    decision: "approve",
  });
  const { redirect_url } = await decided.json();
  check(
    redirect_url?.startsWith(`${REDIRECT}?`),
    "allowing sends a code back to the client",
    redirect_url
  );
  const code = new URL(redirect_url).searchParams.get("code");
  check(new URL(redirect_url).searchParams.get("state") === "st4te", "with the client's state");

  // 4b. The attack #357 closed. An app registered with a Claude address AND its own is allowed
  // once through Claude, then asks again with its own. Supabase approves that on its own
  // (consent is per app, not per address); the page must still refuse to forward the code.
  const twoFacedId = await register("Claude", REDIRECT, "https://evil.example/cb");
  const firstAsk = await authorize(twoFacedId, REDIRECT);
  const firstOk = await postJson("/api/jarvis/decision", {
    authorization_id: firstAsk.authId,
    decision: "approve",
  });
  check(
    firstOk.status === 200,
    "a two-address app is allowed once through Claude",
    String(firstOk.status)
  );
  const secondAsk = await authorize(twoFacedId, "https://evil.example/cb");
  const page2 = await browser(secondAsk.to);
  const loc2 = page2.headers.get("location") ?? "";
  check(
    !loc2.includes("evil.example") && page2.status === 200,
    "allowed before, it is still not sent to its own address",
    `${page2.status} ${loc2.slice(0, 80)}`
  );
  const html2 = await page2.text();
  check(
    html2.includes("connects only to Claude"),
    "and the page says Jarvis connects only to Claude"
  );
  // Only the already-allowed branch says this, so the check proves Supabase auto-approved it.
  check(
    html2.includes("An app you allowed before"),
    "it was the already-allowed path that refused"
  );
  const d2 = await postJson("/api/jarvis/decision", {
    authorization_id: secondAsk.authId,
    decision: "approve",
  });
  const d2body = await d2.text();
  check(
    d2.status === 400 && !d2body.includes("evil.example"),
    "and the decision route refuses it too",
    String(d2.status)
  );
  const malformed = await browser(
    `${SITE}/jarvis/connect?authorization_id=${encodeURIComponent("../authorize?client_id=x")}`
  );
  check(
    malformed.status === 200 && !malformed.headers.get("location"),
    "a malformed request id is refused on the page",
    String(malformed.status)
  );

  // 5. Token, then Jarvis as the person.
  const tokenRes = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const tokens = await tokenRes.json();
  openSession = tokens.access_token ?? null;
  check(
    tokenRes.ok && tokens.access_token,
    "the code is exchanged for a token",
    tokenRes.ok ? "" : JSON.stringify(tokens)
  );
  const init = await mcp(tokens.access_token, { method: "initialize", params: {} });
  check(init.status === 200, "Jarvis answers the person", String(init.status));
  const search = await mcp(tokens.access_token, {
    method: "tools/call",
    params: { name: "list_sources", arguments: {} },
  });
  check(search.status === 200, "a tool call works", String(search.status));

  // 6. Refresh, as Claude does every hour.
  const refreshed = await (
    await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      }),
    })
  ).json();
  check(Boolean(refreshed.access_token), "the refresh token works");
  if (refreshed.access_token) openSession = refreshed.access_token;
  const afterRefresh = await mcp(refreshed.access_token, { method: "ping" });
  check(afterRefresh.status === 200, "and the new token opens Jarvis", String(afterRefresh.status));

  // 7. Revocation: sign the session out; after the minute of trust, Jarvis refuses it.
  const out = await fetch(`${SUPA}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: KEY, authorization: `Bearer ${refreshed.access_token}` },
  });
  check(out.status === 204, "the session is signed out", String(out.status));
  if (out.status === 204) openSession = null;
  console.log("      waiting 65 s for the cached answer to expire…");
  await new Promise((r) => setTimeout(r, 65_000));
  const revoked = await mcp(refreshed.access_token, { method: "ping" });
  check(
    revoked.status === 401,
    "a signed-out session no longer opens Jarvis",
    String(revoked.status)
  );
} catch (err) {
  failures++;
  console.log(`FAIL  the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  // 8. Tidy up: the session this made, then every app it registered.
  if (openSession) {
    await fetch(`${SUPA}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: KEY, authorization: `Bearer ${openSession}` },
    }).catch(() => undefined);
  }
  for (const id of registered) {
    const d = await admin(`/auth/v1/admin/oauth/clients/${id}`, { method: "DELETE" });
    check(d.ok, `removed client ${id.slice(0, 8)}`, String(d.status));
  }
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
