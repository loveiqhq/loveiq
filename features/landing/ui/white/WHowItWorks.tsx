import type { FC } from "react";

const steps = [
  {
    step: "Step one",
    num: "01",
    title: "Take the assessment",
    body: "We guide you through the key dimensions that shape your intimate life — one careful question at a time.",
  },
  {
    step: "Step two",
    num: "02",
    title: "Get your report",
    body: "Your answers translate into a personalized report — the signature of how your sexuality works.",
  },
  {
    step: "Step three",
    num: "03",
    title: "Grow with guidance",
    body: "Clear, practical steps help you translate insight into changed behaviour, week by week.",
  },
];

const WHowItWorks: FC = () => {
  return (
    <section className="bg-[#f5f6f8] py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mb-12 flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
              Protocol
            </span>
          </div>
          <h2 className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text font-serif text-4xl font-normal text-transparent sm:text-[46px]">
            How it works
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-16">
          {steps.map((s) => (
            <div key={s.num} className="animate-on-scroll flex flex-col gap-3">
              <div className="flex items-center justify-between border-t border-black/10 pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
                  {s.step}
                </span>
                <span className="font-serif text-3xl text-[#161021]/15">{s.num}</span>
              </div>
              <h3 className="font-serif text-[22px] font-bold text-[#161021]">{s.title}</h3>
              <p className="text-[15px] leading-relaxed text-[#6b6678]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WHowItWorks;
