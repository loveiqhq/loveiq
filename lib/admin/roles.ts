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
  "GET:/api/admin/survey-status": "viewer",
  // PATCH endpoints — editor
  "PATCH:/api/admin/submissions/[id]": "editor",
  // Admin-only actions
  "DELETE:/api/admin/submissions/[id]": "admin",
  "GET:/api/admin/export": "admin",
  "PATCH:/api/admin/survey-status": "admin",
};
