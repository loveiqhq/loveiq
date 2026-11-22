import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase Auth client for API routes and server components.
 * Reads/writes auth cookies via next/headers.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              // The sign-in's flags (features/admin/server/sign-in.ts): never readable by scripts.
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
              });
            } catch {
              // Ignore — may be called from a server component where
              // cookies are read-only. The middleware handles refresh.
            }
          });
        },
      },
    }
  );
}
