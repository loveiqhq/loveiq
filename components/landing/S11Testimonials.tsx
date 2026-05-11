import Image from "next/image";
import type { FC, ReactNode } from "react";

type Testimonial = {
  quote: ReactNode;
  name: string;
  title: string;
  stars: number;
};

const testimonials: Testimonial[] = [
  {
    quote: (
      <>
        <span>The results were </span>
        <span className="font-bold">more insightful than I expected</span>
        <span>.</span>
        <span>
          {" "}
          It connected dots between emotional triggers and communication styles I hadn’t noticed
          before. Solid UX, too.
        </span>
      </>
    ),
    name: "Noah, 29",
    title: "Software Engineer",
    stars: 5,
  },
  {
    quote: (
      <>
        <span>The report was </span>
        <span className="font-bold">shockingly accurate</span>
        <span>.</span>
        <span>
          {" "}
          And the science behind it? Legit. I liked seeing the blend of emotional intelligence and
          cognitive behavior models.
        </span>
      </>
    ),
    name: "Amir, 41",
    title: "Product Manager",
    stars: 5,
  },
  {
    quote: (
      <>
        <span>We took the quiz together and compared our results—it </span>
        <span className="font-bold">
          sparked one of the best conversations we&apos;ve ever had.
        </span>
        <span> It helped us understand our emotional rhythm better.</span>
      </>
    ),
    name: "Chloe & Andre",
    title: "34 & 35",
    stars: 5,
  },
  {
    quote: (
      <>
        <span>We thought it’d be just fun. Turns out, it </span>
        <span className="font-bold">opened a new level of communication</span>
        <span> in our relationship. Every couple should try this.</span>
      </>
    ),
    name: "Kim & Eli",
    title: "26 & 27",
    stars: 5,
  },
];

const ratingAvatars = [
  "/a791b20c354705558e2dce132f88640a8b4f563a.jpg",
  "/762ab2dcc4e38a7a2824b7a4f5174f2627a7eaae.webp",
  "/2239bb32f51b4c83bfb647cee859127eae298678.jpg",
];

const avatars = [
  { src: "/0caefb431b1f1926399c403cc0418e06f729df1c.jpg" },
  { src: "/fbc4c2241d9dc0e49b93289c9388c37e2de9be1b.jpg" },
  { src: "/people-in-relationships.webp" },
  { src: "/0f7ed5d44e1082e3707e71327b5df742609705a3.jpg" },
];

const S11Testimonials: FC = () => {
  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="stories-heading"
    >
      <div className="content-shell relative flex flex-col items-center gap-10">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
          <div className="flex -space-x-2">
            {ratingAvatars.map((src, idx) => (
              <div
                key={idx}
                className="h-7 w-7 overflow-hidden rounded-full border border-white/30 bg-white/10"
              >
                <Image
                  src={src}
                  alt="Happy customer"
                  width={28}
                  height={28}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
          <span>4.9/5 Rating</span>
        </div>

        <div className="space-y-2 text-center">
          <h2
            id="stories-heading"
            className="font-serif text-3xl leading-tight text-text-primary sm:text-4xl md:text-5xl"
          >
            <span className="text-[#c36ddf]">30,000+</span> people have taken a
            <br />
            first step to understand themselves.
          </h2>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-2">
          {testimonials.map((item, idx) => (
            <div
              key={item.name}
              className="flex h-full flex-col justify-between rounded-[24px] border border-white/5 bg-[rgba(30,16,46,0.6)] p-10 shadow-[0_10px_44px_-3px_rgba(167,139,250,0.1),0_4px_6px_-4px_#A78BFA] backdrop-blur-[2px] transition-transform duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_20px_60px_-3px_rgba(167,139,250,0.2),0_8px_12px_-4px_#A78BFA]"
            >
              <div>
                <div
                  className="mb-4 flex items-center gap-1 text-accent-orange"
                  role="img"
                  aria-label={`${item.stars} star rating`}
                >
                  {Array.from({ length: item.stars }).map((_, i) => (
                    <svg
                      key={i}
                      aria-hidden
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                    >
                      <path d="M12 2.5 14.9 8l6.1.8-4.5 4.5 1.1 6.2-5.5-3-5.5 3 1-6.2-4.5-4.5 6.1-.8z" />
                    </svg>
                  ))}
                </div>
                <p className="font-serif text-[20px] leading-[32.5px] italic text-[#D1D5DB] [&_span]:font-serif [&_span]:text-[20px] [&_span]:leading-[32.5px] [&_span]:italic [&_span]:text-[#D1D5DB]">
                  &ldquo;{item.quote}&rdquo;
                </p>
              </div>
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <div
                    className="h-14 w-14 overflow-hidden rounded-full border border-white/20 shadow-soft"
                    aria-hidden="true"
                  >
                    <Image
                      src={avatars[idx]?.src ?? avatars[0]!.src}
                      alt={item.name}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[16px] font-semibold leading-6 text-white">{item.name}</p>
                    <p className="text-[14px] font-medium leading-5 text-[#9ca3af]">{item.title}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default S11Testimonials;
