import type { FC } from "react";
import Link from "next/link";
import { FOOTER } from "./painPointContent";
import { PP_FOCUS, PP_TYPE } from "./ppStyles";

/**
 * The board's footer: one line for the company and the legal pages, on the grey band. The
 * board names four; the other three the video page's footer links (cookies, terms of use,
 * digital content terms) join them (Fatih, 15 Nov). Its links keep the board's look
 * (#6b5b95, underlined, #4000b6 under a mouse). Marked for section_seen, as the video page's
 * footer is, so "reached the footer" reads on both arms.
 */
const PFooter: FC = () => (
  <footer
    data-landing-section="footer"
    className={`border-t border-solid border-[#e9e6ee] bg-[#f5f6f8] px-6 py-10 ${PP_TYPE}`}
  >
    <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-4 text-[13px] text-[#6b6678]">
      <span>{FOOTER.line}</span>
      <span className="flex flex-wrap gap-x-[18px] gap-y-2">
        {FOOTER.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-[#6b5b95] underline hover:text-[#4000b6] ${PP_FOCUS}`}
          >
            {link.label}
          </Link>
        ))}
      </span>
    </div>
  </footer>
);

export default PFooter;
