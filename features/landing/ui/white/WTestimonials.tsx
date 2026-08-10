import Image from "next/image";
import type { FC, ReactNode } from "react";

/**
 * White-variant "Field reports" social proof — a left-aligned 10,000+ stat with
 * a rating cluster, above a full-bleed auto-scrolling carousel of curated review
 * cards. Pixel-matched to Figma node 7828:9430 (light theme). Photos + copy are
 * the curated set in /public/testimonials (the dark landing's former testimonials).
 * Trustpilot is intentionally NOT used here yet — see the Trustpilot kill switch
 * in shared/ui/trustpilot/config.ts (re-enable once enough reviews land).
 */

const StarIcon: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FE6839" aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const Stars: FC = () => (
  // role="img" — a bare <div> may not carry aria-label (axe: aria-prohibited-attr).
  <div className="flex items-center gap-0.5" role="img" aria-label="5 out of 5 stars">
    {Array.from({ length: 5 }).map((_, i) => (
      <StarIcon key={i} />
    ))}
  </div>
);

type Testimonial = {
  name: string;
  title: string;
  avatarSrc: string;
  quote: ReactNode;
};

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Dorian, 34",
    title: "File manager",
    avatarSrc: "/testimonials/dorian.jpg",
    quote: (
      <>
        {`The `}
        <strong className="font-bold">results are extensive and spot-on</strong>
        {`, without the test being too long. I got to know myself better, and it will help my partner understand me better as well.`}
      </>
    ),
  },
  {
    name: "Philipp Leonhard, 42",
    title: "Product Owner IT",
    avatarSrc: "/testimonials/philipp.jpg",
    quote: (
      <>
        {`"I'd never really explored my sexuality or the patterns behind it before. I already learned a lot just from taking the test, but the `}
        <strong className="font-bold">
          insights in the full report were truly eye-opening. Absolutely worth it.
        </strong>
        {`"`}
      </>
    ),
  },
  {
    name: "Richard Petrich, 34",
    title: "Entrepreneur",
    avatarSrc: "/testimonials/richard.jpg",
    quote: (
      <>
        {`"The results were `}
        <strong className="font-bold">more insightful than I expected</strong>
        {`. It connected dots between emotional triggers and communication styles I hadn't noticed before. Solid UX, too."`}
      </>
    ),
  },
  {
    name: "Marija Mustapić, 41",
    title: "IT Infrastructure",
    avatarSrc: "/testimonials/marija.jpg",
    quote: (
      <>
        {`"Unlocking my report was `}
        <strong className="font-bold">one of the best investments made for my sexuality</strong>
        {`. It is shockingly precise."`}
      </>
    ),
  },
];

const RATING_AVATARS = [
  "/testimonials/rating-1.jpg",
  "/testimonials/rating-2.jpg",
  "/testimonials/rating-3.jpg",
];

const ReviewCard: FC<{ t: Testimonial; ariaHidden?: boolean }> = ({ t, ariaHidden }) => (
  <figure
    aria-hidden={ariaHidden || undefined}
    className="flex w-[340px] shrink-0 flex-col gap-4 rounded-[24px] border border-white/40 bg-[#f5f6f8] p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.18),0_4px_6px_-4px_rgba(0,0,0,0.18)] backdrop-blur-[2px] md:w-[390px]"
  >
    <div className="flex items-center gap-3">
      <Image
        src={t.avatarSrc}
        alt={t.name}
        width={82}
        height={82}
        className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
        sizes="72px"
      />
      <figcaption className="flex flex-col">
        <span className="font-sans text-[18px] font-bold leading-7 text-black">{t.name}</span>
        <span className="font-sans text-[14px] font-normal leading-5 text-black/55">{t.title}</span>
      </figcaption>
    </div>
    <Stars />
    <blockquote className="font-serif text-[16px] italic leading-[1.9] text-black">
      {t.quote}
    </blockquote>
  </figure>
);

const WTestimonials: FC = () => {
  return (
    <section className="overflow-hidden bg-white py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mb-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          {/* Left: eyebrow + 10,000+ stat + subtitle */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
              <span className="text-[11px] font-bold tracking-wide text-[#6b6678]">
                Field reports
              </span>
            </div>
            <p className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text font-serif text-[64px] font-normal leading-none text-transparent md:text-[84px]">
              10,000+
            </p>
            <p className="max-w-md font-serif text-[24px] font-medium leading-snug text-[#161021] md:text-[28px]">
              people have taken a first step to understand themselves.
            </p>
          </div>

          {/* Right: overlapping rating avatars + score */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {RATING_AVATARS.map((src, i) => (
                <div
                  key={src}
                  className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-white"
                  style={{
                    marginRight: i < RATING_AVATARS.length - 1 ? "-12px" : "0",
                    zIndex: RATING_AVATARS.length - i,
                  }}
                >
                  <Image src={src} alt="" fill className="object-cover" sizes="40px" />
                </div>
              ))}
            </div>
            <Stars />
            <p className="font-sans text-[14px] font-medium text-black">4.9/5 Rating</p>
          </div>
        </div>
      </div>

      {/* Full-bleed auto-scrolling carousel. Reduced motion → static scrollable row. */}
      <div className="relative w-full overflow-hidden motion-reduce:overflow-x-auto">
        <div className="flex w-max gap-[29px] px-4 py-6 [animation-play-state:running] animate-marquee-x hover:[animation-play-state:paused]">
          {TESTIMONIALS.map((t) => (
            <ReviewCard key={t.name} t={t} />
          ))}
          {/* Second set is purely visual for the seamless loop — hidden from a11y tree. */}
          {TESTIMONIALS.map((t) => (
            <ReviewCard key={`dup-${t.name}`} t={t} ariaHidden />
          ))}
        </div>
      </div>
    </section>
  );
};

export default WTestimonials;
