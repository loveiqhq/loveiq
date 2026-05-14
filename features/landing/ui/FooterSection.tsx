import Link from "next/link";
import type { FC } from "react";
import { LoveIQMark, LoveIQWordmark } from "@/components/branding/LoveIQBrand";

const FooterSection: FC = () => {
  return (
    <footer
      className="relative overflow-hidden bg-gradient-to-b from-[#0A0510] to-[#110518] px-4 pb-10 pt-12 text-text-primary"
      aria-labelledby="footer-heading"
    >
      <div className="content-shell relative flex flex-col gap-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} />
              <h2 id="footer-heading">
                <LoveIQWordmark className="text-xl" />
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-[#9CA3AF]">
              Democratizing sexual psychology. We translate complex research into actionable
              insights for everyday life.
            </p>
          </div>

          {/* Explore Column */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Explore</h3>
            <ul className="space-y-2 text-sm list-none p-0 m-0">
              <li>
                <Link
                  href="/"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/glossary"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                >
                  Glossary
                </Link>
              </li>
              <li>
                <Link
                  href="/trust-zone"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                >
                  Trust Center
                </Link>
              </li>
              <li>
                <Link
                  href="/survey"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                >
                  Survey
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Company</h3>
            <div className="space-y-2 text-sm text-[#9CA3AF]">
              <p className="font-medium">Applied Psychometrics UG</p>
              <p>Hasenheide 62, 10967 Berlin</p>
              <p>hello@loveiq.org</p>
            </div>
          </div>

          {/* Legal Column */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Legal</h3>
            <ul className="space-y-2 text-sm list-none p-0 m-0">
              <li>
                <Link
                  href="/privacy-policy"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/cookies"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/imprint"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Imprint
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-and-conditions"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-use"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href="/digital-content-terms"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Digital Content & Subscription Terms
                </Link>
              </li>
              <li>
                <Link
                  href="/medical-disclaimer"
                  className="text-[#9CA3AF] transition hover:text-white focus-visible-ring rounded"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Medical & Psychological Disclaimer
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 text-xs text-text-muted">
          <p>© 2026 Applied Psychometrics UG. Designed & developed with ❤️.</p>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
