import type { FC } from "react";

const cards = [
  {
    title: "Actionable",
    description:
      "Personalized next steps, bite-size practices, and guided reflection prompts, so you know exactly what to try this week.",
    tone: "from-[#ff8a5a] to-[#f26d4f]",
  },
  {
    title: "Science-Backed",
    description:
      "Based on over +100 scientific papers papers & books from the worlds leading therapists and researchers.",
    tone: "from-[#7c6bff] to-[#a7c1ff]",
  },
  {
    title: "100% Private",
    description:
      "Your data is anonymous. We prioritize your privacy and do not sell your personal information or link results to your identity.",
    tone: "from-[#f26d4f] to-[#ff9450]",
  },
];

const IconBolt = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m13 2-7 12h6l-1 8 7-12h-6z" />
  </svg>
);

const IconScience = () => (
  <svg
    aria-hidden
    viewBox="0 0 28 28"
    className="h-7 w-7"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7 21H16.3333"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.5 25.6667H24.5"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.3333 25.6666C20.8406 25.6666 24.5 22.0072 24.5 17.4999C24.5 12.9926 20.8406 9.33325 16.3333 9.33325H15.1667"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 16.3333H12.8333"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 14C9.21219 14 8.16666 12.9545 8.16666 11.6667V7H15.1667V11.6667C15.1667 12.9545 14.1211 14 12.8333 14H10.5"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 6.99992V3.49992C14 2.85602 13.4772 2.33325 12.8333 2.33325H10.5C9.85611 2.33325 9.33334 2.85602 9.33334 3.49992V6.99992"
      stroke="#A78BFA"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconPrivacy = () => (
  <svg
    aria-hidden
    viewBox="0 0 28 28"
    className="h-7 w-7"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12.5218 5.92209C18.1068 5.25652 23.4514 8.39265 25.5943 13.5929C25.6916 13.8549 25.6916 14.143 25.5943 14.4049C25.1656 15.4444 24.5989 16.4215 23.9097 17.3099"
      stroke="#FE6839"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.4313 16.5176C15.058 17.844 12.875 17.825 11.525 16.475C10.1749 15.1249 10.1559 12.9419 11.4823 11.5686"
      stroke="#FE6839"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.3922 20.4154C17.2607 22.2704 13.4779 22.6735 10.0259 21.5201C6.57388 20.3668 3.79314 17.7707 2.40566 14.4059C2.30843 14.144 2.30843 13.8559 2.40566 13.5939C3.44007 11.0854 5.26012 8.98004 7.59266 7.59375"
      stroke="#FE6839"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.33334 2.33325L25.6667 25.6666"
      stroke="#FE6839"
      strokeWidth="2.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const icons = [IconBolt, IconScience, IconPrivacy];

const S10Pillars: FC = () => {
  return (
    <section
      className="section-shell relative bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="pillars-heading"
    >
      <div className="content-shell relative flex flex-col gap-6 lg:flex-row">
        {cards.map((card, idx) => {
          const Icon = icons[idx];
          return (
            <div
              key={card.title}
              className={`animate-on-scroll ${idx > 0 ? `stagger-${idx}` : ""} group relative flex flex-1 flex-col items-start justify-center gap-4 rounded-[32px] border border-white/10 bg-[#150A22] px-10 py-12 shadow-[0_25px_50px_-12px_rgba(167,139,250,0.1)] transition-all duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_25px_60px_-12px_rgba(167,139,250,0.25)]`}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_50%_50%,rgba(167,139,250,0.15),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
              />
              <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                <Icon />
              </div>
              <div className="relative space-y-2">
                <h2
                  className="font-serif text-xl font-semibold text-white"
                  id={idx === 0 ? "pillars-heading" : undefined}
                >
                  {card.title}
                </h2>
                <p className="text-sm leading-relaxed text-white/60">{card.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default S10Pillars;
