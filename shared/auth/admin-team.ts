/**
 * The one account the admin opens for (Eman, 22 Nov 2026: "only login with password just like on
 * staging"): a Supabase Auth user whose password is the team password mixed with
 * ADMIN_TEAM_PASSWORD_SECRET, in `admin_users` as admin, in production's and staging's projects
 * alike. Nothing is ever emailed to it. Its own file so the proxy can read it without the
 * sign-in's server code.
 */
export const ADMIN_TEAM_EMAIL = "ap-team@loveiq.org";
