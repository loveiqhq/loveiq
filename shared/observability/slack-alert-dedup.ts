import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * Atomically claim a Slack alert slot for (kind, entityType, entityId). Used
 * by the detector crons to ensure the same (e.g.) abandoned-checkout fires
 * only one Slack ping across all serverless instances. Returns true on first
 * claim, false on subsequent calls — including across deploys, since the
 * source of truth is the `slack_alert_sent` table.
 */
export async function tryClaimSlackAlert(
  kind: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn({ kind, entityType, entityId }, "tryClaimSlackAlert: supabase not configured");
    return false;
  }

  try {
    const response = await fetchWithTimeout(
      `${url}/rest/v1/slack_alert_sent?on_conflict=kind,entity_type,entity_id`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // ignore-duplicates so an existing row doesn't return 409; we then
          // detect a duplicate via the empty response body.
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({ kind, entity_type: entityType, entity_id: entityId }),
        timeoutMs: 5000,
      }
    );

    if (!response.ok) {
      logger.warn(
        { kind, entityType, entityId, status: response.status },
        "tryClaimSlackAlert: insert failed"
      );
      return false;
    }

    const rows = (await response.json().catch(() => [])) as Array<{ id: number }>;
    // No row returned = ON CONFLICT was hit = someone else already claimed.
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, kind, entityType, entityId }, "tryClaimSlackAlert: error");
    return false;
  }
}

/**
 * Constant-time bearer-token check for cron routes. All four detector crons
 * share this so the auth pattern stays uniform.
 */
export function verifyCronAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
