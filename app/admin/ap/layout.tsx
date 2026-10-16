import ApShell from "@features/admin/ui/ap/ApShell";

/** AP-Analytics: its own light shell inside the admin (app/admin/layout.tsx steps aside). */
export default function ApLayout({ children }: { children: React.ReactNode }) {
  return <ApShell>{children}</ApShell>;
}
