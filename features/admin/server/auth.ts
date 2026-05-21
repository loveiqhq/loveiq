import { createSupabaseServer } from "@features/admin/server/supabase-server";
import { supabaseFetch } from "@features/admin/server/supabase";
import type { AdminRole, AdminUser } from "@features/admin/server/roles";

/**
 * Verify admin session and return user info with role.
 * Belt-and-suspenders check alongside middleware gate.
 * Returns null if not authenticated or not in admin_users.
 */
export async function verifyAdminSession(): Promise<AdminUser | null> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) return null;

    // Check admin_users allowlist + get role
    const res = await supabaseFetch(
      `/rest/v1/admin_users?email=eq.${encodeURIComponent(user.email)}&select=email,role&limit=1`
    );

    if (!res.ok) return null;

    const admins = await res.json();
    if (!Array.isArray(admins) || admins.length === 0) return null;

    return { email: admins[0].email, role: admins[0].role as AdminRole };
  } catch {
    return null;
  }
}
