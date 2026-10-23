export type AdminRole = "viewer" | "editor" | "admin";

export interface AdminUser {
  email: string;
  role: AdminRole;
}

const ROLE_HIERARCHY = new Map<AdminRole, number>([
  ["viewer", 0],
  ["editor", 1],
  ["admin", 2],
]);

/** Check if user's role meets or exceeds the required minimum. */
export function hasRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return (ROLE_HIERARCHY.get(userRole) ?? -1) >= (ROLE_HIERARCHY.get(requiredRole) ?? -1);
}
