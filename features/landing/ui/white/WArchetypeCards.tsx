import type { FC } from "react";

// Self-contained subset of the archetype profile data shown on the dark site
// (features/landing/ui/S06Archetypes.tsx). Duplicated here intentionally rather
// than refactoring the dark carousel — these are static marketing values and
// keeping the working dark component untouched avoids regression risk.
const cards: {
  name: string;
  tagline: string;
  color: string;
  coreMotivation: string;
  dims: { label: string; value: string }[];
}[] = [
  {
    name: "Spark Seeker",
    tagline: "Let’s find the spark — then turn it into a blaze.",
    color: "#ff6a3d",
    coreMotivation: "Pleasure & play",
    dims: [
      { label: "Communication", value: "Charming" },
      { label: "Attachment", value: "Avoidant/secure" },
      { label: "Initiation", value: "Active" },
      { label: "Power orientation", value: "Switch" },
    ],
  },
  {
    name: "Sensual Connector",
    tagline: "Touch me with presence and meet me with heart.",
    color: "#e57373",
    coreMotivation: "Intimacy & bonding",
    dims: [
      { label: "Communication", value: "Authentic" },
      { label: "Attachment", value: "Anxious" },
      { label: "Initiation", value: "Responsive" },
      { label: "Power orientation", value: "Switch" },
    ],
  },
  {
    name: "Authority Conductor",
    tagline: "I set the frame — and we play inside it.",
    color: "#ff9f1c",
    coreMotivation: "Power",
    dims: [
      { label: "Communication", value: "Commanding" },
      { label: "Attachment", value: "Disorganized" },
      { label: "Initiation", value: "Active" },
      { label: "Power orientation", value: "Dominant" },
    ],
  },
  {
    name: "Tender Devotee",
    tagline: "Tell me I’m enough.",
    color: "#e7b3c2",
    coreMotivation: "Validation",
    dims: [
      { label: "Communication", value: "Adaptive" },
      { label: "Attachment", value: "Anxious" },
      { label: "Initiation", value: "Responsive" },
      { label: "Power orientation", value: "Submissive" },
    ],
  },
  {
    name: "Radiant Performer",
    tagline: "Watch me shine.",
    color: "#e6b65c",
    coreMotivation: "Validation",
    dims: [
      { label: "Communication", value: "Expressive" },
      { label: "Attachment", value: "Mixed" },
      { label: "Initiation", value: "Active" },
      { label: "Power orientation", value: "Switch" },
    ],
  },
  {
    name: "Curious Apprentice",
    tagline: "Teach me everything.",
    color: "#6faed9",
    coreMotivation: "Growth",
    dims: [
      { label: "Communication", value: "Open" },
      { label: "Attachment", value: "Secure" },
      { label: "Initiation", value: "Shared" },
      { label: "Power orientation", value: "Switch" },
    ],
  },
];

const WArchetypeCards: FC = () => {
  return (
    <section className="bg-[#f5f6f8] py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mb-12 max-w-2xl">
          <h2 className="font-serif text-3xl font-medium text-[#161021] sm:text-[40px]">
            A signature, not a box.
          </h2>
          <p className="mt-3 text-[17px] leading-relaxed text-[#6b6678]">
            Every archetype is a distinct profile across the dimensions that shape intimacy. Here
            are a few — your report places you across all fourteen.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.name}
              className="animate-on-scroll flex flex-col gap-4 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-10 w-10 shrink-0 rounded-xl"
                  style={{ backgroundColor: card.color }}
                />
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-bold text-[#161021]">{card.name}</h3>
                  <p className="truncate font-serif text-[13px] italic text-[#6b7280]">
                    “{card.tagline}”
                  </p>
                </div>
              </div>

              <div
                className="rounded-xl border px-4 py-3"
                style={{ borderColor: `${card.color}55` }}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
                  Core motivation
                </p>
                <p className="font-serif text-lg font-medium text-[#161021]">
                  {card.coreMotivation}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {card.dims.map((d) => (
                  <div key={d.label}>
                    <dt className="text-[11px] text-[#6b7280]">{d.label}</dt>
                    <dd className="font-serif text-[15px] font-medium text-[#161021]">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WArchetypeCards;
