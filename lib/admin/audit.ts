import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface AuditEntry {
  admin_email: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Fire-and-forget audit log insert. Never blocks the main response. */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/admin_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    // Never fail the main request — just log the error
    logger.error({ err, ...entry }, "Failed to write admin audit log");
  }
}
