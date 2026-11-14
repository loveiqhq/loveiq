import type { FC } from "react";
import Link from "next/link";
import { FOOTER } from "./painPointContent";
import { PP_FOCUS } from "./PCta";
import { PP_TYPE } from "./ppStyles";

/**
 * The board's footer: one line for the company and the four legal pages it names, on the
 * grey band. Its links keep the board's look (#6b5b95, underlined, #4000b6 under a mouse).
 * The video page's footer also links the cookie policy, the terms of use and the digital
 * content terms; the board leaves them out.
 */
const PFooter: FC = () => (
  <footer className={`border-t border-solid border-[#e9e6ee] bg-[#f5f6f8] px-6 py-10 ${PP_TYPE}`}>
    <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-4 text-[13px] text-[#6b6678]">
      <span>{FOOTER.line}</span>
      <span className="flex flex-wrap gap-[18px]">
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
