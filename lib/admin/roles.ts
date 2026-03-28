export type AdminRole = "viewer" | "editor" | "admin";

export interface AdminUser {
  email: string;
  role: AdminRole;
}

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/** Check if user's role meets or exceeds the required minimum. */
export function hasRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/** Route-action to minimum role mapping. */
const ROUTE_PERMISSIONS: Record<string, AdminRole> = {
  // GET endpoints — viewer
  "GET:/api/admin/stats": "viewer",
  "GET:/api/admin/submissions": "viewer",
  "GET:/api/admin/submissions/[id]": "viewer",
  "GET:/api/admin/submissions/[id]/timeline": "viewer",
  "GET:/api/admin/submissions/[id]/notes": "viewer",
  "GET:/api/admin/survey-status": "viewer",
  "GET:/api/admin/funnels/conversion": "viewer",
  "GET:/api/admin/funnels/cohorts": "viewer",
  "GET:/api/admin/comparisons/segment": "viewer",
  "GET:/api/admin/comparisons/correlation": "viewer",
  "GET:/api/admin/answers/distribution": "viewer",
  "GET:/api/admin/pulse/activity": "viewer",
  "GET:/api/admin/pulse/at-risk": "viewer",
  "GET:/api/admin/views": "viewer",
  "GET:/api/admin/growth/referrals": "viewer",
  "GET:/api/admin/growth/geography": "viewer",
  "GET:/api/admin/growth/waitlist-conversion": "viewer",
  "GET:/api/admin/annotations": "viewer",
  "GET:/api/admin/product-kpis/discrimination": "viewer",
  "GET:/api/admin/export-presets": "viewer",
  // PATCH/POST endpoints — editor
  "PATCH:/api/admin/submissions/[id]": "editor",
  "PATCH:/api/admin/submissions/bulk": "editor",
  "POST:/api/admin/submissions/[id]/notes": "editor",
  "PATCH:/api/admin/submissions/[id]/notes/[noteId]": "editor",
  "DELETE:/api/admin/submissions/[id]/notes/[noteId]": "editor",
  "POST:/api/admin/views": "editor",
  "DELETE:/api/admin/views/[id]": "editor",
  "POST:/api/admin/annotations": "editor",
  "DELETE:/api/admin/annotations/[id]": "editor",
  "POST:/api/admin/export-presets": "editor",
  "DELETE:/api/admin/export-presets/[id]": "editor",
  // Admin-only actions
  "DELETE:/api/admin/submissions/[id]": "admin",
  "GET:/api/admin/export": "admin",
  "PATCH:/api/admin/survey-status": "admin",
  "GET:/api/admin/digest": "admin",
  "GET:/api/admin/audit": "admin",
};
