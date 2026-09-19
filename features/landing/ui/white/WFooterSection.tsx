import Link from "next/link";
import type { FC } from "react";
import { LoveIQMark, LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";

const exploreLinks = [
  { label: "Home", href: "/" },
  { label: "About us", href: "/about" },
  { label: "Glossary", href: "/glossary" },
  { label: "Trust Center", href: "/trust-zone" },
  { label: "Test", href: "/survey" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Cookie Policy", href: "/cookies" },
  { label: "Imprint", href: "/imprint" },
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "Terms of Use", href: "/terms-of-use" },
  { label: "Digital Content & Subscription Terms", href: "/digital-content-terms" },
  { label: "Medical & Psychological Disclaimer", href: "/medical-disclaimer" },
];

const WFooterSection: FC = () => {
  return (
    <footer
      className="relative border-t border-black/[0.08] bg-gray-50 px-4 pb-10 pt-12 text-gray-700"
      aria-labelledby="w-footer-heading"
    >
      <div className="content-shell relative flex flex-col gap-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} />
              <h2 id="w-footer-heading">
                <LoveIQWordmark className="text-xl" loveClassName="text-gray-900" />
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-gray-500">
              Democratizing sexual psychology. We translate complex research into actionable
              insights for everyday life.
            </p>
          </div>

          {/* Explore */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Explore</h3>
            <ul className="m-0 list-none space-y-2 p-0 text-sm">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="focus-visible-ring rounded text-gray-500 transition hover:text-gray-900"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Company</h3>
            <div className="space-y-2 text-sm text-gray-500">
              <p className="font-medium">Applied Psychometrics UG</p>
              <p>Hasenheide 62, 10967 Berlin</p>
              <p>hello@loveiq.org</p>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Legal</h3>
            <ul className="m-0 list-none space-y-2 p-0 text-sm">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="focus-visible-ring rounded text-gray-500 transition hover:text-gray-900"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-black/[0.08] pt-6 text-xs text-gray-500">
          <p>© 2026 Applied Psychometrics UG. Designed &amp; developed with ❤️.</p>
        </div>
      </div>
    </footer>
  );
};

export default WFooterSection;
