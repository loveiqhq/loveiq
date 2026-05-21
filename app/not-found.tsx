import type { Metadata } from "next";
import NotFoundPage from "@features/not-found/ui/NotFoundPage";

export const metadata: Metadata = {
  title: "Page Not Found | LoveIQ",
  description: "The page you're looking for doesn't exist.",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundPage />;
}
