import type { CSSProperties, FC } from "react";

const steps = [
  {
    step: "Step One",
    title: "Take the Assessment",
    description: "We’ll guide you through eight key dimensions that shape your sexual life.",
    badge: "~15 minutes",
    variant: "sliders",
  },
  {
    step: "Step Two",
    title: "Get your freemium Report",
    description:
      "Gain new insights into your sexuality with a personalized report based on archetypes.",
    badge: "Based on latest science",
    variant: "brain",
  },
  {
    step: "Step Three",
    title: "Grow With Guidance",
    description: "Discover insights that spark real behavioral change for deeper fulfillment.",
    badge: "Life enhancing impact",
    variant: "chat",
  },
];

type OrbitIconId = "spark" | "heart" | "shield" | "chat" | "target" | "infinity";

const orbitIcons: { id: OrbitIconId; colors: [string, string] }[] = [
  { id: "spark", colors: ["#fe6839", "#ffb774"] },
  { id: "heart", colors: ["#a78bfa", "#7c3aed"] },
  { id: "shield", colors: ["#7dd3fc", "#a78bfa"] },
  { id: "chat", colors: ["#ff8b5f", "#fe6839"] },
  { id: "target", colors: ["#c084fc", "#60a5fa"] },
  { id: "infinity", colors: ["#f97316", "#c084fc"] },
];

const OrbitGlyph = ({ id }: { id: OrbitIconId }) => {
  switch (id) {
    case "spark":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3 13.4 9.2 20 10.6 13.4 12 12 18.2 10.6 12 4 10.6l6.6-1.4L12 3Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "heart":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 19s-5-3.4-5-7.1a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6C21 15.6 16 19 16 19h0Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "shield":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3.5 19 7v5.2c0 3.6-2.9 6.8-7 8-4.1-1.2-7-4.4-7-8V7l7-3.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 12.5 12 15l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chat":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6.5 6.5h11A1.5 1.5 0 0 1 19 8v6a1.5 1.5 0 0 1-1.5 1.5H11l-3.5 2.5v-2.5h-1A1.5 1.5 0 0 1 5 14V8A1.5 1.5 0 0 1 6.5 6.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "target":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case "infinity":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 12c1.2-2 3.4-2 4.6 0s3.4 2 4.6 0 3.4-2 4.6 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18 12c-1.2 2-3.4 2-4.6 0s-3.4-2-4.6 0-3.4 2-4.6 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
};

const S02HowItWorks: FC = () => {
  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 pt-24 pb-16 text-text-primary md:pt-28 md:pb-20"
      aria-labelledby="how-it-works-heading"
    >
      <div className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 -top-20 h-24 bg-gradient-to-b from-[#0b0613] via-[#0b0613]/60 to-[#0A0510]" />
      <div className="pointer-events-none absolute left-[-440px] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 lg:block">
        <div
          className="absolute inset-6 rounded-full border border-dashed border-[#a78bfa]/14 animate-spin-slow"
          style={{ animationDuration: "50s" }}
        />
        <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: "55s" }}>
          {orbitIcons.map((icon, idx) => {
            const angle = (idx / orbitIcons.length) * 360;
            const [from, to] = icon.colors;
            const iconSpinStyle = { animation: "spin-slow 55s linear infinite reverse" };

            return (
              <div
                key={icon.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  className="h-14 w-14"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-230px) rotate(-${angle}deg)`,
                  }}
                >
                  <div
                    className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-[rgba(20,15,30,0.9)] shadow-[0_16px_36px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                    style={{ ...iconSpinStyle, transformOrigin: "center center" }}
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/85"
                      style={{
                        background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), transparent 55%), linear-gradient(140deg, ${from}22, ${to}14)`,
                        boxShadow: `0 10px 26px ${from}22`,
                        color: "#f6f3ff",
                      }}
                      aria-hidden
                    >
                      <OrbitGlyph id={icon.id} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none absolute right-[-440px] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 lg:block">
        <div
          className="absolute inset-6 rounded-full border border-dashed border-[#a78bfa]/14 animate-spin-slow"
          style={{ animationDuration: "50s", animationDirection: "reverse" }}
        />
        <div
          className="absolute inset-0 animate-spin-slow"
          style={{ animationDuration: "55s", animationDirection: "reverse" }}
        >
          {orbitIcons.map((icon, idx) => {
            const angle = (idx / orbitIcons.length) * 360;
            const [from, to] = icon.colors;
            const iconSpinStyle = { animation: "spin-slow 55s linear infinite" };

            return (
              <div
                key={icon.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  className="h-14 w-14"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-230px) rotate(-${angle}deg)`,
                  }}
                >
                  <div
                    className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-[rgba(20,15,30,0.9)] shadow-[0_16px_36px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                    style={{ ...iconSpinStyle, transformOrigin: "center center" }}
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/85"
                      style={{
                        background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), transparent 55%), linear-gradient(140deg, ${from}22, ${to}14)`,
                        boxShadow: `0 10px 26px ${from}22`,
                        color: "#f6f3ff",
                      }}
                      aria-hidden
                    >
                      <OrbitGlyph id={icon.id} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="content-shell relative flex flex-col gap-12">
        <h2
          id="how-it-works-heading"
          className="text-center font-serif text-[44px] leading-tight text-white sm:text-[52px]"
        >
          How it Works
        </h2>

        <div className="relative">
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item, idx) => {
              const isFirst = idx === 0;

              return (
                <div
                  key={item.title}
                  className={`group col-anim relative flex h-full flex-col gap-6 overflow-visible rounded-[28px] border border-[rgba(255,255,255,0.05)] shadow-[0_26px_80px_rgba(0,0,0,0.55)] transition-all duration-500 ${
                    isFirst
                      ? "min-h-[400px] bg-[#1e102e] px-7 py-7 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(84,20,117,0.18)]"
                      : "min-h-[480px] bg-[#1e102e] px-8 py-7 hover:-translate-y-2 hover:border-[rgba(167,139,250,0.35)] hover:shadow-[0_28px_90px_rgba(84,20,117,0.18)]"
                  }`}
                  style={{ animationDelay: `${0.08 * idx}s` } as CSSProperties}
                >
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(242,109,79,0.08),transparent_42%),radial-gradient(circle_at_82%_28%,rgba(124,88,255,0.08),transparent_40%)]" />
                  </div>

                  <div className="relative space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                      {item.step}
                    </p>
                    <h3 className="font-serif text-[22px] text-white sm:text-[24px]">
                      {item.title}
                    </h3>
                    <p className="text-[15px] leading-relaxed text-white/70">{item.description}</p>
                  </div>

                  <div className="relative mt-auto overflow-hidden rounded-2xl border border-[#241938] bg-[#1f152f] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.55)] transition-colors duration-500 group-hover:bg-[#251a35]">
                    {item.variant === "sliders" && (
                      <>
                        {isFirst ? (
                          <div className="relative flex h-[170px] items-center justify-center overflow-hidden rounded-[18px] bg-[#1d132b] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.4)]">
                            <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-[radial-gradient(circle_at_30%_30%,rgba(254,104,57,0.08),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(124,88,255,0.08),transparent_55%)]" />
                            <div className="relative flex flex-col gap-3 text-white/80">
                              {[
                                {
                                  dot: "#ff6a3a",
                                  fill: "#4b395e",
                                  width: 96,
                                  knob: false,
                                  translate: "translate-x-4 group-hover:translate-x-0",
                                },
                                {
                                  dot: "#8028ff",
                                  fill: "#4b395e",
                                  width: 96,
                                  knob: true,
                                  translate: "-translate-x-4 group-hover:translate-x-0 delay-75",
                                },
                                {
                                  dot: "#ffffff",
                                  fill: "#4b395e",
                                  width: 96,
                                  knob: false,
                                  translate: "translate-x-2 group-hover:translate-x-0 delay-100",
                                },
                              ].map((row) => (
                                <div
                                  key={row.dot}
                                  className={`mx-auto flex w-[180px] items-center gap-3 rounded-[14px] bg-[#2a203b] px-4 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.35)] transition-transform duration-500 ${row.translate}`}
                                >
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: row.dot }}
                                  />
                                  <div
                                    className="h-1.5 flex-1 rounded-full"
                                    style={{ backgroundColor: row.fill, maxWidth: row.width }}
                                  />
                                  {row.knob && (
                                    <span className="h-3 w-3 rounded-full border border-[#6f647d]" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="relative flex h-[170px] items-center justify-center overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.05)] bg-[#22142f] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.32)]">
                            <div className="relative flex flex-col gap-3 text-white/70">
                              <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#2a1838]/80 px-4 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.28)]">
                                <span className="h-3 w-3 rounded-full bg-[#ff6a3a]" />
                                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                  <div className="absolute left-0 top-0 h-full w-[80px] rounded-full bg-[rgba(255,255,255,0.1)]" />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#2a1838]/80 px-4 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.28)]">
                                <span className="h-3 w-3 rounded-full bg-[#541475]" />
                                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                  <div className="absolute left-0 top-0 h-full w-[64px] rounded-full bg-[rgba(255,255,255,0.1)]" />
                                  <span
                                    className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgba(255,255,255,0.22)] bg-transparent"
                                    style={{ left: "72%" }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#2a1838]/80 px-4 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.28)]">
                                <span className="h-3 w-3 rounded-full bg-white" />
                                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                  <div className="absolute left-0 top-0 h-full w-[48px] rounded-full bg-[rgba(255,255,255,0.1)]" />
                                  <span
                                    className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
                                    style={{
                                      left: "48px",
                                      boxShadow: "0 0 0 6px rgba(255,255,255,0.14)",
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {item.variant === "brain" && (
                      <div className="relative flex h-[170px] items-center justify-center overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.05)] bg-[#241731] p-10 shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-transform duration-500 group-hover:scale-[1.02]">
                        <div className="absolute h-[140px] w-[140px] rounded-full border border-[rgba(254,104,57,0.24)] border-dashed transition-transform duration-700 spin-on-hover" />
                        <div className="absolute h-[180px] w-[180px] rounded-full border border-[rgba(84,20,117,0.22)] border-dashed transition-transform duration-700 spin-on-hover-reverse" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2a1838] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-500 group-hover:translate-y-[-4px] group-hover:scale-105">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 32 32"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M16 6.66669C16.0043 5.21495 15.2216 3.87485 13.9551 3.16527C12.6886 2.45569 11.1371 2.48803 9.9012 3.24977C8.66535 4.01151 7.93924 5.38306 8.004 6.83336C6.41598 7.24168 5.10403 8.35777 4.44646 9.85983C3.78889 11.3619 3.85879 13.0829 4.636 14.5267C3.2667 15.6391 2.53612 17.3567 2.68449 19.1147C2.83285 20.8726 3.84097 22.4435 5.37734 23.3107C5.12269 25.2809 5.9842 27.2294 7.61293 28.3669C9.24165 29.5044 11.3676 29.6423 13.1297 28.7249C14.8918 27.8074 15.9979 25.9866 16 24V6.66669"
                              stroke="#FE6839"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M16 6.66669C15.9957 5.21495 16.7784 3.87485 18.0449 3.16527C19.3114 2.45569 20.863 2.48803 22.0988 3.24977C23.3347 4.01151 24.0608 5.38306 23.996 6.83336C25.584 7.24168 26.896 8.35777 27.5535 9.85983C28.2111 11.3619 28.1412 13.0829 27.364 14.5267C28.7333 15.6391 29.4639 17.3567 29.3155 19.1147C29.1672 20.8726 28.159 22.4435 26.6227 23.3107C26.8773 25.2809 26.0158 27.2294 24.3871 28.3669C22.7584 29.5044 20.6324 29.6423 18.8703 28.7249C17.1082 27.8074 16.0021 25.9866 16 24V6.66669"
                              stroke="#FE6839"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M20 17.3333C17.7108 16.528 16.1321 14.4231 16 12"
                              stroke="#FE6839"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M23.4653 8.66671C23.788 8.10749 23.9706 7.47846 23.9973 6.83337"
                              stroke="#FE6839"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                    {item.variant === "chat" && (
                      <div className="relative flex h-[170px] items-center justify-center overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.05)] bg-[#241731] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-colors duration-500 group-hover:bg-[#2a183f]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(254,104,57,0.12),transparent_60%)] transition-transform duration-700 group-hover:scale-125" />

                        <div className="relative w-full max-w-[220px]">
                          <div className="absolute left-1/2 top-1/2 flex w-[180px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[14px] bg-[#2e0147] px-5 py-3 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(0,0,0,0.3)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4 text-[#ff6a3a]"
                              fill="currentColor"
                            >
                              <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10Z" />
                            </svg>
                            Understand Desire
                          </div>
                          <div className="absolute left-1/2 top-[12px] flex -translate-x-1/2 -rotate-6 items-center rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[#2a1838]/80 px-4 py-[7px] text-[11px] font-semibold text-[#ff6a3a] shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition-transform duration-500 group-hover:translate-y-1 group-hover:rotate-2">
                            And Deepen Bonds!
                          </div>
                          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 rotate-6 items-center rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[#2a1838]/85 px-3 py-[7px] text-[11px] font-semibold text-[#a78bfa] shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:-rotate-1">
                            Finally...
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative mt-3 flex items-center gap-3">
                    <div
                      className={`inline-flex items-center gap-3 font-semibold ${
                        isFirst
                          ? "rounded-[12px] border border-[#2f2543] bg-[#231733] px-4 py-2 text-[13px] text-[#A78BFA] shadow-none transition-all duration-300"
                          : "rounded-full border border-[rgba(255,255,255,0.08)] bg-[#2a1838] px-4 py-2 text-[12px] text-[#a78bfa] shadow-none transition-all duration-300"
                      }`}
                    >
                      <span className="tracking-wide">{item.badge}</span>
                    </div>
                  </div>

                  {idx < steps.length - 1 && (
                    <>
                      <div className="pointer-events-auto absolute right-[-28px] top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#3a2c4a] bg-[#2A1838] text-white/65 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition group-hover:-translate-y-[55%] group-hover:border-[#3a2c4a] group-hover:text-white md:flex">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-[14px] w-[14px]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M5 12h14" />
                          <path d="m13 6 6 6-6 6" />
                        </svg>
                      </div>
                      <div className="pointer-events-auto absolute left-1/2 bottom-[-28px] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-[#3a2c4a] bg-[#2A1838] text-white/65 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition group-hover:-translate-y-[6px] group-hover:border-[#3a2c4a] group-hover:text-white md:hidden">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-[14px] w-[14px] rotate-90"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M5 12h14" />
                          <path d="m13 6 6 6-6 6" />
                        </svg>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default S02HowItWorks;
