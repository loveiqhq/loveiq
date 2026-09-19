import {
  DOCS_WRITE_SCOPE,
  DRIVE_WRITE_SCOPE,
  getDelegatedToken,
  getGoogleAccessToken,
} from "@shared/http/google-oauth";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

/**
 * Writing Google Docs, as the Workspace user the brain is delegated to act for.
 *
 * TWO OPERATIONS AND NO THIRD: create a document, or append to one. There is
 * deliberately no delete, no overwrite and no edit-in-place, even though the granted
 * scope permits all three. A scope is what the credential COULD do; a tool is what it
 * WILL do, and the two do not have to match. Appending cannot destroy anything, so the
 * worst outcome here is a paragraph in the wrong place, which a person can remove.
 *
 * REACHES DOCS AS A PERSON, not as a robot. `getDelegatedToken` signs a JWT whose `sub`
 * is the Workspace admin, so a document created here is owned by them and visible to
 * everyone they would normally share with — rather than living in a service account's
 * Drive where nobody can find it.
 */

const DOCS_API = "https://docs.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export class GoogleDocRefusal extends Error {}

/** Distinguishes "the Workspace grant is missing" from every other failure, because the
 *  fix for it is an admin console visit and not a retry. */
export class DelegationNotGranted extends Error {
  constructor(scope: string) {
    super(
      `Google refused a delegated token for ${scope} even with a working credential, so ` +
        `the scope is not authorised for this workspace. Someone with Workspace admin ` +
        `access adds it under Security → Access and data control → API controls → Manage ` +
        `Domain Wide Delegation, for client id 116552495667268648554. TWO SEPARATE ` +
        `SWITCHES are needed and this is only one of them: the other is the Docs API ` +
        `being enabled on the Cloud project. Nothing was written.`
    );
  }
}

function admin(): string {
  const who = process.env.GOOGLE_WORKSPACE_ADMIN?.trim();
  if (!who) throw new Error("GOOGLE_WORKSPACE_ADMIN is unset, so there is nobody to act as");
  return who;
}

/**
 * `getDelegatedToken` returns null for several different problems, and this used to
 * report every one of them as a missing Workspace grant.
 *
 * FOUND THE FIRST TIME IT RAN FOR REAL. There was no usable Google credential at all —
 * the run had fallen through to the refresh token, which is dead by design — and the
 * tool answered "Google has not authorised this server… ask a Workspace admin". The
 * grant was already in place. That sends someone into an admin console to fix something
 * that is not broken, which is the exact failure this file is written against.
 *
 * So the caller credential is checked first, and only a delegation that fails WITH a
 * working credential is reported as a missing grant.
 */
async function token(scope: string, oidc?: string | null): Promise<string> {
  const caller = await getGoogleAccessToken(Date.now(), oidc);
  if (!caller) {
    throw new Error(
      "There is no usable Google credential on this deployment, so nothing was even " +
        "attempted. This is NOT the Workspace grant — do not go and change it. In " +
        "production the credential comes from Vercel's OIDC token; locally, mint one " +
        "with gcloud and set GOOGLE_OAUTH_ACCESS_TOKEN."
    );
  }
  const t = await getDelegatedToken(admin(), scope, Date.now(), oidc);
  if (!t) throw new DelegationNotGranted(scope);
  return t;
}

async function google(
  url: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    timeoutMs: 20_000,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (json.error as { message?: string } | undefined)?.message;
    throw new Error(message ?? `google_${res.status}`);
  }
  return json;
}

export interface DocResult {
  id: string;
  title: string;
  url: string;
  created: boolean;
  folder: string | null;
}

/** A Docs id, or a full Docs URL with the id in it. */
export function docIdFrom(given: string): string | null {
  const trimmed = given.trim();
  const fromUrl = /\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(trimmed);
  if (fromUrl) return fromUrl[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

/**
 * Docs' `insertText` takes an index, and getting it wrong writes into the middle of
 * someone's document. `endOfSegmentLocation: {}` means "the end of the body" and is the
 * only form that cannot land anywhere else — no index arithmetic, so nothing to get
 * wrong as a document changes under us.
 */
function appendRequests(text: string): Array<Record<string, unknown>> {
  return [{ insertText: { endOfSegmentLocation: {}, text } }];
}

export async function createGoogleDoc(input: {
  title: string;
  content?: string;
  /** A Drive folder id, or a folder name to look up. Omit to leave it in My Drive. */
  folder?: string;
  oidc?: string | null;
}): Promise<DocResult> {
  const title = input.title.trim();
  if (!title) throw new GoogleDocRefusal("Give the document a title.");

  const docsToken = await token(DOCS_WRITE_SCOPE, input.oidc);
  const doc = await google(`${DOCS_API}/documents`, docsToken, {
    method: "POST",
    body: { title },
  });
  const id = String(doc.documentId ?? "");
  if (!id) throw new Error("Google created no document id");

  if (input.content?.trim()) {
    await google(`${DOCS_API}/documents/${id}:batchUpdate`, docsToken, {
      method: "POST",
      body: { requests: appendRequests(input.content) },
    });
  }

  let folder: string | null = null;
  if (input.folder?.trim()) {
    // Filing needs Drive, not Docs — a separate scope and a separate token, so a
    // workspace that granted one and not the other still gets the document.
    const driveToken = await token(DRIVE_WRITE_SCOPE, input.oidc);
    const target = await resolveFolder(input.folder.trim(), driveToken);
    const move = new URLSearchParams({
      addParents: target.id,
      removeParents: "root",
      supportsAllDrives: "true",
    });
    await google(`${DRIVE_API}/files/${id}?${move.toString()}`, driveToken, {
      method: "PATCH",
      body: {},
    });
    folder = target.name;
  }

  return {
    id,
    title,
    url: `https://docs.google.com/document/d/${id}/edit`,
    created: true,
    folder,
  };
}

async function resolveFolder(
  given: string,
  driveToken: string
): Promise<{ id: string; name: string }> {
  if (/^[A-Za-z0-9_-]{20,}$/.test(given)) return { id: given, name: given };
  // Escaped, because a folder name with an apostrophe would otherwise close the quoted
  // string and turn the rest of the name into query syntax.
  const safe = given.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "10",
    // Shared drives are off by default in the Drive API, so a folder the team keeps in
    // one would simply not be found.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = (await google(`${DRIVE_API}/files?${params.toString()}`, driveToken)) as {
    files?: Array<{ id: string; name: string }>;
  };
  const files = res.files ?? [];
  if (files.length === 0) throw new GoogleDocRefusal(`No Drive folder called "${given}".`);
  if (files.length > 1) {
    throw new GoogleDocRefusal(
      `More than one Drive folder is called "${given}" — pass the id of the one you mean:\n` +
        files.map((f) => `  ${f.id}`).join("\n")
    );
  }
  return files[0]!;
}

export async function appendToGoogleDoc(input: {
  document: string;
  content: string;
  oidc?: string | null;
}): Promise<DocResult> {
  const id = docIdFrom(input.document);
  if (!id) {
    throw new GoogleDocRefusal(
      `"${input.document}" is not a Google Docs id or link. Pass the id, or the whole ` +
        `https://docs.google.com/document/d/… URL.`
    );
  }
  if (!input.content.trim()) throw new GoogleDocRefusal("There is nothing to add.");

  const docsToken = await token(DOCS_WRITE_SCOPE, input.oidc);
  // Read first, so the result can name the document a person will recognise — and so a
  // wrong id fails before anything is written rather than after.
  const doc = await google(`${DOCS_API}/documents/${id}?fields=title`, docsToken);
  await google(`${DOCS_API}/documents/${id}:batchUpdate`, docsToken, {
    method: "POST",
    body: { requests: appendRequests(input.content) },
  });
  return {
    id,
    title: String(doc.title ?? "(untitled)"),
    url: `https://docs.google.com/document/d/${id}/edit`,
    created: false,
    folder: null,
  };
}
