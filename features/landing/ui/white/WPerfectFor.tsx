import Image from "next/image";
import type { FC } from "react";

const personas = [
  {
    title: "Singles",
    description:
      "Gain self-awareness, attract healthier partners, and stop repeating old patterns.",
    image: "/carousel/singles.png",
  },
  {
    title: "People in Relationships",
    description: "Decode each other’s needs and create more intimacy, ease, and connection.",
    image: "/carousel/relationships.png",
  },
  {
    title: "Couples Exploring Growth",
    description: "Strengthen communication, sexual alignment, and long-term compatibility.",
    image: "/carousel/couplesGrowth.png",
  },
  {
    title: "Self-Development Lovers",
    description:
      "Anyone obsessed with understanding their psychology, attachment style, and desire patterns.",
    image: "/carousel/selfDevelopers.png",
  },
  {
    title: "Therapists & Coaches",
    description:
      "Use a structured psychometric tool to help clients articulate their emotional and sexual identity.",
    image: "/carousel/therapists.png",
  },
];

const WPerfectFor: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24" aria-labelledby="w-audience-heading">
      <div className="content-shell">
        <div className="animate-on-scroll mx-auto mb-12 max-w-2xl text-center">
          <h2
            id="w-audience-heading"
            className="font-serif text-3xl font-medium text-[#161021] sm:text-[44px]"
          >
            Who is this perfect for?
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[#6b6678]">
            For people ready to explore who they are, grow with more awareness, and bring more
            intention into their intimate lives.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => (
            <div
              key={p.title}
              className="animate-on-scroll overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_2px_20px_rgba(0,0,0,0.05)]"
            >
              <div className="relative h-52 w-full overflow-hidden">
                <Image
                  src={p.image}
                  alt={p.title}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 90vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col gap-2 p-5">
                <h3 className="font-serif text-xl font-semibold text-[#161021]">{p.title}</h3>
                <p className="text-sm leading-relaxed text-[#6b6678]">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WPerfectFor;
