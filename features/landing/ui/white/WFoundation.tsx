import type { FC, ReactNode } from "react";
import Image from "next/image";

/**
 * "The foundation" — how a result is derived, next to two academic spotlights
 * (Figma node 9200:32671 / VAR-A).
 *
 * The step icons are the designer's own SVG exports (public/images/white/
 * foundation/). Figma marks both quotes with a "DRAFT QUOTE" chip; that chip is
 * deliberately not rendered, so these read as approved attributed statements —
 * keep them in sync with what the board members have actually signed off.
 */

const steps: { icon: string; title: string; body: string }[] = [
  {
    icon: "/images/white/foundation/step-1.svg",
    title: "≈60 calibrated items",
    body: "Situational questions across the full instrument, not self-flattering ones.",
  },
  {
    icon: "/images/white/foundation/step-2.svg",
    title: "Scored against 30,000+ responses",
    body: "Each answer loads onto the model's dimensions, weighted by data, refined over time.",
  },
  {
    icon: "/images/white/foundation/step-3.svg",
    title: "Matched to your nearest personality",
    body: "The shape of your scores finds its closest match, with the distance to neighbouring types kept visible.",
  },
];

/** Rail segment colours, sampled from the Figma gradient so the joins line up. */
const RAIL = ["from-[#bf66d9] to-[#958ef6]", "from-[#958ef6] to-[#e9e6ee]"];

const spotlights: {
  quote: ReactNode;
  name: string;
  credentials: string;
  photo: string;
}[] = [
  {
    quote: (
      <>
        &ldquo;Care and transparency should{" "}
        <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
          go hand in hand
        </span>
        . Especially when technology touches intimacy. LoveIQ helps people understand not only their
        result, but the reasoning behind it, because meaningful feedback should always be
        explainable.&rdquo;
      </>
    ),
    name: "Dr. Dijana Galijašević",
    credentials: "Business Ethics & Social Science · HHL & ESADE",
    photo: "/academic/dijana-avatar.jpg",
  },
  {
    quote: (
      <>
        &ldquo;The 14 personalities aren&rsquo;t invented categories. They&rsquo;re{" "}
        <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
          recurring patterns
        </span>{" "}
        in how desire, attachment and arousal cluster across the research.&rdquo;
      </>
    ),
    name: "Dr. Bruno Steinkraus",
    credentials: "Biochemistry & Neuroscience · Oxford & Imperial",
    photo: "/academic/bruno-avatar.jpg",
  },
];

const WFoundation: FC = () => (
  <section className="bg-white py-16 lg:py-[84px]" aria-labelledby="w-foundation-heading">
    <div className="content-shell">
      {/* Centered intro */}
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3.5 text-center">
        <div className="animate-on-scroll flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
          <span className="text-[12px] font-bold tracking-[1.68px] text-[#5f6675]">
            THE FOUNDATION
          </span>
        </div>
        <h2
          id="w-foundation-heading"
          className="animate-on-scroll stagger-1 font-serif text-[clamp(1.6rem,4.5vw,2.125rem)] font-medium leading-[1.28] tracking-[-0.01em] text-[#161021]"
        >
          Built by researchers, not by a personality quiz.
        </h2>
      </div>

      <div className="mt-11 grid gap-12 lg:grid-cols-2 lg:gap-14">
        {/* Left: derivation rail */}
        <div className="flex flex-col">
          <div className="animate-on-scroll flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[12px] font-bold tracking-[1.68px] text-[#5f6675]">
              HOW YOUR RESULT IS DERIVED
            </span>
          </div>

          <ol className="m-0 mt-6 list-none p-0">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={`animate-on-scroll stagger-${i + 1} relative flex gap-5 ${
                  i < steps.length - 1 ? "pb-[30px]" : ""
                }`}
              >
                {/* Rail segment: below this badge down to the next one. Anchored
                    to the row rather than a fixed height so it survives any text
                    wrap. */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[18px] top-[38px] w-0.5 bg-gradient-to-b ${RAIL[i]} bottom-0`}
                  />
                )}
                <span className="relative z-10 h-[38px] w-[38px] shrink-0 rounded-full border-[1.5px] border-accent-orange">
                  {/* Figma stacks a soft gradient tile over the ring; flattened
                      to opaque so the rail can't show through the badge. */}
                  <span className="absolute -left-[1.5px] -top-[2.6px] flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#fee9e3] to-[#f7ecfa]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
                    <img
                      src={s.icon}
                      alt=""
                      aria-hidden
                      width={20}
                      height={20}
                      className="h-5 w-5"
                    />
                  </span>
                </span>
                <div className="flex flex-col gap-[7px] pt-0.5">
                  <h3 className="text-[15px] font-bold text-[#161021]">{s.title}</h3>
                  <p className="text-[13px] leading-5 text-[#5f6675]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="animate-on-scroll mt-[18px] text-[13px] font-semibold text-[#6f6a7a]">
            Grounded in{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text font-bold text-transparent">
              100+
            </span>{" "}
            scientific papers and books.
          </p>
        </div>

        {/* Right: academic spotlights */}
        <div className="flex flex-col gap-4">
          {spotlights.map((s, i) => (
            <figure
              key={s.name}
              className={`animate-on-scroll stagger-${i + 1} m-0 flex flex-col gap-[18px] rounded-[20px] border border-[#e9e6ee] bg-white px-6 py-7 sm:px-8 sm:py-[34px]`}
            >
              <blockquote className="m-0 font-serif text-[17px] italic leading-[26px] text-[#161021]">
                {s.quote}
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  {/* Square face crops (…-avatar.jpg) rather than the tall
                      board photos: object-cover on a landscape source in a 48px
                      circle framed the whole torso. `sizes` is deliberately
                      larger than the box so retina picks a 2–3x candidate.
                      No `quality` override: Next 16 rejects any value not in
                      `images.qualities`, and 75 on a 384px crop is plenty. */}
                  <Image src={s.photo} alt={s.name} fill sizes="96px" className="object-cover" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold text-[#161021]">{s.name}</span>
                  <span className="text-[12.5px] text-[#5f6675]">{s.credentials}</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default WFoundation;
