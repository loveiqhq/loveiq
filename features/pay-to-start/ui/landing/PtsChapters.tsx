import type { FC, ReactNode } from "react";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";
import { RING_ICON_INK, RING_ICON_STROKE, RING_ICON_STYLE } from "@features/landing/ui/ringIcon";
import { PTS_INSIDE, PTS_SAMPLE } from "./payToStartContent";
import { PtsSampleDots } from "./PtsSampleDots";
import { PTS_REVEAL, PTS_SECTION } from "./ptsStyles";

/**
 * Landing V2's two chapter sections (Mark, final 30.10): the report's chapter menu beside the
 * questions it answers, then how one chapter reads.
 */

/** V2's centred section heading: Lora 400, 38/44, its middle words in the logo's gradient. */
const V2_H2 =
  "m-0 text-center font-serif text-[38px] font-normal leading-[44px] tracking-[-0.01em] text-[#161021]";
const LOGO_GRADIENT_TEXT =
  "bg-[linear-gradient(105deg,#d05976_20.51%,#c167cf_48.14%,#8887f6_79.16%)] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]";

export const V2Heading: FC<{
  id: string;
  title: { lead: string; emph: string; tail: string };
  breakAfterLead?: boolean;
}> = ({ id, title, breakAfterLead = false }) => (
  <h2 id={id} className={`${V2_H2} ${PTS_REVEAL}`}>
    {title.lead}
    {breakAfterLead ? <br /> : " "}
    <span className={LOGO_GRADIENT_TEXT}>{title.emph}</span>
    {title.tail.startsWith(".") ? "" : " "}
    {title.tail}
  </h2>
);

const NOTES = new Map<string, (typeof PTS_INSIDE.notes)[number]>(
  PTS_INSIDE.notes.map((note) => [note.id, note])
);

/**
 * The chapter overview, `#inside-your-report`: the live menu as a card (232 wide on a desktop,
 * 178 on a phone), and beside five of its rows a rose tick and the question that chapter
 * answers. One grid row per menu row, so each question stays level with its chapter whatever
 * the menu holds; a question overflows its row rather than pushing the menu apart.
 */
export const PtsInsideReport: FC = () => (
  <section id="inside-your-report" aria-labelledby="pts-inside" className={PTS_SECTION}>
    <V2Heading id="pts-inside" title={PTS_INSIDE.title} breakAfterLead />
    <div className="relative mt-8 grid grid-cols-[178px_1fr] gap-x-[26px] sm:grid-cols-[232px_1fr] sm:gap-x-[30px]">
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-[178px] rounded-[18px] border-[1.5px] border-[#e6dcfa] bg-white shadow-[0_22px_54px_-20px_rgba(103,60,120,0.3)] sm:w-[232px]"
      />
      <ol aria-label="Report chapters" className="contents">
        {REPORT_V4_NAV_PARTS.map((part, partIndex) => (
          <li key={part.part} className="contents">
            <p
              className={`relative z-[1] col-start-1 px-[16px] pb-1.5 font-sans text-[10px] font-bold uppercase leading-[13px] tracking-[0.1em] text-[#b8405e] ${
                partIndex === 0 ? "pt-[19px]" : "pt-[11px]"
              }`}
            >
              {part.part} · {part.label}
            </p>
            <span aria-hidden className="col-start-2" />
            <ul className="contents">
              {part.items.map((item) => {
                const note = NOTES.get(item.id);
                const active = item.id === PTS_INSIDE.activeId;
                return (
                  <li key={item.id} className="contents">
                    <span
                      className={`relative z-[1] col-start-1 mx-[10px] my-[3px] flex h-7 items-center gap-1.5 rounded-lg border font-sans text-[11px] sm:text-[12px] ${
                        active
                          ? "border-[#e6dcfa] bg-[#f3ecff] pl-2 pr-2 font-semibold text-[#161021]"
                          : `border-transparent pl-3 pr-2 ${note ? "font-semibold text-[#161021]" : "font-medium text-[#3f3a4d]"}`
                      }`}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]"
                        />
                      ) : null}
                      {item.label}
                    </span>
                    <span className="relative col-start-2 self-stretch">
                      {note ? (
                        <>
                          <span
                            aria-hidden
                            className="absolute left-[-24px] top-[16px] h-[1.5px] w-[18px] bg-[#e8a3b3] sm:left-[-24px]"
                          />
                          <span
                            className={`absolute left-0 right-0 top-[5px] flex flex-col gap-2 ${PTS_REVEAL}`}
                          >
                            <span
                              className={`font-serif text-[15.5px] leading-5 text-[#161021] [text-wrap:balance] sm:text-[19px] sm:leading-[25px] ${
                                "body" in note ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {note.title}
                            </span>
                            {"body" in note ? (
                              // A phone's menu leaves no room under the title before the next
                              // question (the live menu is shorter than V2's drawing of it).
                              <span className="hidden font-sans text-[15px] font-light leading-[22px] text-[#3f3a4d] sm:block">
                                {note.body}
                              </span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {/* The card's own bottom padding. */}
      <span aria-hidden className="col-start-1 h-2.5" />
    </div>
  </section>
);

const SAMPLE_ICONS: Record<(typeof PTS_SAMPLE.cards)[number]["icon"], ReactNode> = {
  book: (
    <>
      <path d="M2 5c3-1 6-1 10 1 4-2 7-2 10-1v14c-3-1-6-1-10 1-4-2-7-2-10-1V5Z" />
      <path d="M12 6v14" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
};

const SampleIcon: FC<{ icon: keyof typeof SAMPLE_ICONS }> = ({ icon }) => (
  <span
    aria-hidden
    className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl md:h-11 md:w-11 md:rounded-[13px]"
    style={RING_ICON_STYLE}
  >
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={RING_ICON_INK}
      strokeWidth={RING_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SAMPLE_ICONS[icon]}
    </svg>
  </span>
);

const SampleBody: FC<{ card: (typeof PTS_SAMPLE.cards)[number] }> = ({ card }) => {
  switch (card.kind) {
    case "read":
      return (
        <>
          <p className="m-0 font-sans text-[10px] font-bold uppercase leading-[13px] tracking-[0.1em] text-[#b8405e]">
            {card.label}
          </p>
          <p className="mt-2 font-sans text-[13px] leading-5 text-[#3f3a4d]">{card.text}</p>
        </>
      );
    case "shift":
      return (
        <>
          <p className="m-0 font-serif text-[14.5px] italic leading-[21px] text-[#6b4a3a]">
            {card.from}
          </p>
          <p className="mt-2 font-sans text-[10.5px] font-bold leading-[14.3px] tracking-[1.1px] text-[#561dbd]">
            {card.shiftLabel}
          </p>
          <p className="mt-0.5 font-serif text-[14.5px] italic leading-[21px] text-[#161021]">
            {card.to}
          </p>
        </>
      );
    case "try":
      return (
        <>
          <p className="m-0 font-sans text-[13.5px] font-bold leading-[19px] text-[#161021]">
            {card.lead}
          </p>
          <p className="mt-1 font-sans text-[13px] leading-5 text-[#3f3a4d]">
            {card.text}
            <em className="font-serif">{card.quote}</em>
          </p>
        </>
      );
    case "deeper":
      return (
        <div className="flex flex-col gap-2.5">
          {card.sources.map((source) => (
            <div key={source.title}>
              <p className="m-0 font-sans text-[13px] font-bold leading-[18px] text-[#161021]">
                {source.title}
              </p>
              <p className="mt-0.5 font-sans text-[12px] leading-[17px] text-[#6b6678]">
                {source.body}
              </p>
            </div>
          ))}
        </div>
      );
  }
};

/** The track's id, which the phone's dots follow. */
const SAMPLE_TRACK_ID = "pts-sample-track";

/**
 * "Inside Each Chapter": four cards of one chapter, Typical Beliefs. A desktop lays them out in
 * four columns, each heading over its card; a phone swipes them, 84% wide, the dots following.
 * The row flies in as one: a phone's later cards sit beside the screen, where a reveal of
 * their own would never be seen to play.
 */
export const PtsSample: FC<{ lead: string }> = ({ lead }) => (
  <section aria-labelledby="pts-sample" className={PTS_SECTION}>
    <div className="flex flex-col items-center gap-3 text-center">
      <V2Heading id="pts-sample" title={PTS_SAMPLE.title} />
      <p
        className={`m-0 max-w-[560px] font-sans text-[16px] leading-[25px] text-[#3f3a4d] ${PTS_REVEAL}`}
      >
        {lead}
      </p>
    </div>
    <ol
      id={SAMPLE_TRACK_ID}
      aria-label="Inside one chapter"
      // A phone scrolls the row sideways: the keyboard can too, once it is focused.
      tabIndex={0}
      className={`${PTS_REVEAL} focus-visible-ring -mx-4 mt-7 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-5 pt-1 [scrollbar-width:none] md:mx-0 md:mt-10 md:grid md:snap-none md:grid-cols-4 md:gap-4 md:overflow-visible md:p-0`}
    >
      {PTS_SAMPLE.cards.map((card) => (
        <li
          key={card.title}
          className={`flex flex-[0_0_84%] snap-start flex-col rounded-[22px] border-[1.5px] border-[#e6dcfa] bg-white px-5 pb-[22px] pt-5 shadow-[0_18px_40px_-26px_rgba(103,60,120,0.35)] md:flex-auto md:gap-3.5 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
        >
          <SampleIcon icon={card.icon} />
          <div className="mt-3.5 flex flex-col gap-0.5 md:mt-0 md:min-h-[74px] md:gap-1">
            <span className="font-sans text-[13px] font-semibold leading-[18px] text-[#6b5b95]">
              {card.eyebrow}
            </span>
            <h3 className="m-0 font-serif text-[21px] font-medium leading-[27px] text-[#161021] md:text-[20px] md:leading-[26px]">
              {card.title}
            </h3>
          </div>
          <div className="mt-4 border-t border-[#efe8fb] pt-4 md:mt-0 md:flex-auto md:rounded-[18px] md:border-[1.5px] md:border-[#e6dcfa] md:bg-white md:p-4 md:shadow-[0_18px_40px_-26px_rgba(103,60,120,0.3)]">
            <SampleBody card={card} />
          </div>
        </li>
      ))}
    </ol>
    <PtsSampleDots
      trackId={SAMPLE_TRACK_ID}
      count={PTS_SAMPLE.cards.length}
      label={PTS_SAMPLE.swipe}
    />
  </section>
);
