import Image from "next/image";
import type { FC, ReactNode } from "react";

const StarIcon: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FE6839" aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const Stars: FC = () => (
  <div className="flex items-center gap-0.5">
    {Array.from({ length: 5 }).map((_, i) => (
      <StarIcon key={i} />
    ))}
  </div>
);

const Avatar: FC<{ src: string; alt: string }> = ({ src, alt }) => (
  <div className="relative h-[82px] w-[82px] shrink-0 overflow-hidden rounded-full">
    <Image src={src} alt={alt} fill className="object-cover" sizes="82px" />
  </div>
);

type TestimonialCardProps = {
  name: string;
  title: string;
  avatarSrc: string;
  quote: ReactNode;
  stagger?: string;
};

const TestimonialCard: FC<TestimonialCardProps> = ({
  name,
  title,
  avatarSrc,
  quote,
  stagger = "",
}) => (
  <div
    className={`animate-on-scroll ${stagger} relative overflow-hidden rounded-[24px] border border-white/40 bg-[rgba(30,16,46,0.6)] p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.3),0_4px_6px_-4px_rgba(0,0,0,0.3)] backdrop-blur-sm`}
  >
    {/* Person row */}
    <div className="mb-4 flex items-center gap-3">
      <Avatar src={avatarSrc} alt={name} />
      <div>
        <p className="font-sans text-[18px] font-bold leading-7 text-white">{name}</p>
        <p className="font-sans text-[14px] font-normal leading-5 text-white/60">{title}</p>
      </div>
    </div>

    {/* Stars */}
    <div className="mb-4">
      <Stars />
    </div>

    {/* Quote */}
    <p className="font-serif text-[18px] italic leading-[1.625] text-[#d1d5db] md:text-[20px]">
      {quote}
    </p>
  </div>
);

const S15Testimonials: FC = () => {
  const testimonials: TestimonialCardProps[] = [
    {
      name: "Philipp Leonhard, 42",
      title: "Product Owner IT",
      avatarSrc: "/testimonials/philipp.jpg",
      stagger: "",
      quote: (
        <>
          {`"I'd never really explored my sexuality or the patterns behind it before. I already learned a lot just from taking the test, but the `}
          <strong className="font-bold text-white">
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
      stagger: "stagger-1",
      quote: (
        <>
          {`"The results were `}
          <strong className="font-bold text-white">more insightful than I expected</strong>
          {`. It connected dots between emotional triggers and communication styles I hadn't noticed before. Solid UX, too."`}
        </>
      ),
    },
    {
      name: "Dorian, 34",
      title: "File manager",
      avatarSrc: "/testimonials/dorian.jpg",
      stagger: "stagger-2",
      quote: (
        <>
          {`The `}
          <strong className="font-bold text-white">results are extensive and spot-on</strong>
          {`, without the test being too long. I got to know myself better, and it will help my partner understand me better as well.`}
        </>
      ),
    },
    {
      name: "Marija Mustapić, 41",
      title: "IT Infrastructure",
      avatarSrc: "/testimonials/marija.jpg",
      stagger: "stagger-3",
      quote: (
        <>
          {`"Unlocking my report was `}
          <strong className="font-bold text-white">
            one of the best investments made for my sexuality
          </strong>
          {`. It is shockingly precise"`}
        </>
      ),
    },
  ];

  const ratingAvatars = [
    "/testimonials/rating-1.jpg",
    "/testimonials/rating-2.jpg",
    "/testimonials/rating-3.jpg",
  ];

  return (
    <section className="section-shell relative bg-[#0A0510] px-4">
      <div className="content-shell relative flex flex-col items-center">
        {/* Closing " — bottom-right corner of the right card (right edge of content-shell) */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 select-none font-serif text-[128px] leading-[128px] text-white/5"
        >
          &rdquo;
        </span>
        {/* Header */}
        <div className="animate-on-scroll mb-16 flex flex-col items-center gap-6 text-center">
          {/* Avatars + rating */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {ratingAvatars.map((src, i) => (
                <div
                  key={i}
                  className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-[#0a0510]"
                  style={{
                    marginRight: i < ratingAvatars.length - 1 ? "-12px" : "0",
                    zIndex: ratingAvatars.length - i,
                  }}
                >
                  <Image src={src} alt="" fill className="object-cover" sizes="40px" />
                </div>
              ))}
            </div>
            <p className="pl-2 font-sans text-sm font-bold text-white">4.9/5 Rating</p>
          </div>

          {/* Heading */}
          <h2 className="max-w-3xl font-serif text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl md:leading-[1.2]">
            <span className="bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff] bg-clip-text text-transparent">
              30,000+
            </span>{" "}
            people have taken a
            <br />
            first step to understand themselves.
          </h2>
        </div>

        {/* 2×2 Card grid */}
        <div className="w-full grid gap-8 md:grid-cols-2">
          {testimonials.map((t) => (
            <TestimonialCard key={t.name} {...t} />
          ))}
        </div>

        {/* Opening " — flow element after grid, centered (Figma: sibling of main container, items-center) */}
        <span
          aria-hidden
          className="pointer-events-none mt-0 h-[128px] w-[57px] select-none self-center font-serif text-[128px] leading-[128px] text-white/5"
        >
          &ldquo;
        </span>
      </div>
    </section>
  );
};

export default S15Testimonials;
