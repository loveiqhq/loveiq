import type { Metadata } from "next";
import Link from "next/link";
import {
  GUIDE,
  GUIDE_PRACTICES,
  SKIP_IT,
  type GuidePart,
  type GuidePractice,
} from "@features/mira/content/guide";
import { cardById, type EvidenceCard } from "@features/mira/server/cards";
import { MiraFrame } from "@features/mira/ui/MiraShell";
import GuideHashScroll from "@features/mira/ui/GuideHashScroll";
import { miraLinkPreview } from "@features/mira/link-preview";

const GUIDE_TITLE = "Body confidence guide | LoveIQ";
const GUIDE_DESCRIPTION =
  "How to stop feeling self-conscious during sex: why it happens, and seven short practices to get out of your head and back into what you feel.";

export const metadata: Metadata = {
  title: GUIDE_TITLE,
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/guide", GUIDE_TITLE, GUIDE_DESCRIPTION),
};

/**
 * The body confidence guide, open to everyone (the text and where it comes from:
 * features/mira/content/guide.ts). Mira points here by practice number (#practice-1 to 7).
 */
export default function MiraGuidePage() {
  const cards = GUIDE.sources.cards
    .map((id) => cardById(id))
    .filter((c): c is EvidenceCard => Boolean(c));
  return (
    <MiraFrame>
      <GuideHashScroll />
      <article className="max-w-[720px] text-[16px] leading-relaxed text-ap-body [&_h2]:mt-12 [&_h2]:font-serif [&_h2]:text-[26px] [&_h2]:font-medium [&_h2]:leading-tight [&_h2]:text-ap-ink [&_h3]:mt-8 [&_h3]:font-serif [&_h3]:text-[20px] [&_h3]:font-medium [&_h3]:text-ap-ink [&_p]:mt-3">
        <p className="text-[12px] uppercase tracking-[0.14em] text-ap-muted">{GUIDE.kicker}</p>
        <h1 className="mt-2 font-serif text-[34px] font-medium leading-tight text-ap-ink [overflow-wrap:anywhere]">
          {GUIDE.title}
        </h1>
        <p className="text-[18px]">{GUIDE.subtitle}</p>

        <nav
          aria-label="Contents"
          className="mt-8 rounded-3xl border border-ap-line p-5 text-[15px]"
        >
          <p className="!mt-0 font-semibold text-ap-ink">Contents</p>
          <ul className="mt-2 flex flex-col gap-2">
            {GUIDE.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="underline">
                  {s.title}
                </a>
                {s.stages ? (
                  <ul className="mt-2 flex flex-col gap-2 pl-4">
                    {s.stages.map((st, i) => (
                      <li key={st.title}>
                        <a href={`#stage-${i + 1}`} className="underline">
                          Stage {i + 1}: {st.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            <li>
              <a href="#sources" className="underline">
                Sources
              </a>
            </li>
          </ul>
        </nav>

        {GUIDE.sections.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>{s.title}</h2>
            {s.parts.map((part, i) => (
              <Part key={i} part={part} />
            ))}
            {s.stages ? (
              <>
                <ol aria-label="Where to start" className="mt-3 list-decimal pl-6">
                  {GUIDE_PRACTICES.map((p) => (
                    <li key={p.number} className="mt-1">
                      <a href={`#practice-${p.number}`} className="underline">
                        {p.name}
                      </a>
                    </li>
                  ))}
                </ol>
                {s.stages.map((st, i) => (
                  <section key={st.title} id={`stage-${i + 1}`}>
                    <h3>
                      Stage {i + 1}: {st.title}
                    </h3>
                    <p>{st.intro}</p>
                    {st.practices.map((p) => (
                      <Practice key={p.number} p={p} />
                    ))}
                  </section>
                ))}
              </>
            ) : null}
          </section>
        ))}

        <p className="!mt-10 rounded-2xl bg-ap-lilac px-4 py-3 text-[15px]">
          Questions about a practice?{" "}
          <Link href="/mira" className="font-semibold text-[#561dbd] underline">
            Talk it through with Mira
          </Link>
          , our AI coach.
        </p>

        <section id="sources" className="text-[14px]">
          <h2>Sources</h2>
          <h3>LoveIQ&apos;s own research</h3>
          <ul className="mt-2 list-disc pl-5">
            {GUIDE.sources.loveiq.map((t) => (
              <li key={t} className="mt-2">
                {t}
              </li>
            ))}
          </ul>
          <h3>Research</h3>
          <ul className="mt-2 list-disc pl-5 [overflow-wrap:anywhere]">
            {cards.map((c) => (
              <li key={c.id} className="mt-2">
                {c.citation}
                {c.link ? (
                  <>
                    {" "}
                    <a href={c.link} className="underline">
                      {c.link}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
            {GUIDE.sources.other.map((t) => (
              <li key={t} className="mt-2">
                {t}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </MiraFrame>
  );
}

function Part({ part }: { part: GuidePart }) {
  return (
    <>
      {part.heading ? <h3>{part.heading}</h3> : null}
      {part.steps ? (
        <ol className="mt-3 list-decimal pl-6">
          {part.steps.map((st) => (
            <li key={st.title} className="mt-2">
              <strong className="text-ap-ink">{st.title}</strong> {st.text}
            </li>
          ))}
        </ol>
      ) : null}
      {part.paragraphs?.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </>
  );
}

/** One practice in the spec's five parts: name and time, when it helps, steps, why, skip. */
function Practice({ p }: { p: GuidePractice }) {
  return (
    <section id={`practice-${p.number}`} className="mt-6 rounded-3xl border border-ap-line p-5">
      <h4 className="font-serif text-[19px] font-semibold leading-snug text-ap-ink">
        Practice {p.number}: {p.name}
      </h4>
      <p className="!mt-1 text-[14px] text-ap-muted">
        {p.time} · Best for: {p.bestFor}
      </p>
      {p.intro.map((t) => (
        <p key={t}>{t}</p>
      ))}
      <p className="font-semibold text-ap-ink">How to do it</p>
      <ol className="mt-1 list-decimal pl-6">
        {p.steps.map((t) => (
          <li key={t} className="mt-2">
            {t}
          </li>
        ))}
      </ol>
      {p.after.map((t) => (
        <p key={t}>{t}</p>
      ))}
      <p>
        <strong className="text-ap-ink">Why it works:</strong> {p.why}
      </p>
      <p className="italic">{SKIP_IT}</p>
    </section>
  );
}
