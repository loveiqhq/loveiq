import Image from "next/image";
import type { FC } from "react";

const experts = [
  {
    name: "Dr. Dijana Galijašević",
    tags: ["Business Ethics", "Social Science"],
    photo: "/academic/dijana.jpg",
    photoPosition: "30% 15%",
  },
  {
    name: "Dr. Bruno Steinkraus",
    tags: ["Biochemistry", "Neuroscience"],
    photo: "/academic/bruno.jpg",
    photoPosition: "63% 15%",
    photoScale: 1.2,
  },
  {
    name: "Dr. Quentin Ferry",
    tags: ["Machine Learning", "Molecular Biology"],
    photo: "/academic/quentin.png",
    photoPosition: "center 25%",
  },
];

const renderLogos = (index: number) => {
  switch (index) {
    case 0: // Dijana — Columbia + HHL
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/columbia-logo.svg"
            alt="Columbia University logo"
            style={{ height: 40, width: 58, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/hhl-logo.svg"
            alt="HHL Leipzig logo"
            style={{ height: 34, width: 136 }}
          />
        </>
      );
    case 1: // Bruno — ICL + Oxford
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/icl-logo.svg"
            alt="Imperial College London logo"
            style={{ height: 28, width: 107, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            style={{ height: 38, width: 128, transform: "scaleY(-1)" }}
          />
        </>
      );
    case 2: // Quentin — Oxford + MIT
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            style={{ height: 34, width: 115, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/academic/mit-logo.svg" alt="MIT logo" style={{ height: 40, width: 75 }} />
        </>
      );
    default:
      return null;
  }
};

const S08AcademicBoard: FC = () => {
  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-white"
      aria-labelledby="academic-board-heading"
    >
      <div className="content-shell flex flex-col items-center gap-8">
        <h2
          id="academic-board-heading"
          className="max-w-[889px] text-center font-serif text-3xl font-normal leading-tight tracking-[-0.02em] text-white sm:text-4xl md:text-5xl lg:text-[64px] lg:leading-[64px] lg:tracking-[-1.2px]"
        >
          Supported by academic multidisciplinary expertise
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg font-light leading-relaxed text-text-secondary">
          Our Academic Board supports us that what we build is grounded in science, ethics and state
          of the art methodology.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-6 pb-8 sm:mt-16">
        {experts.map((expert, index) => (
          <div
            key={expert.name}
            className="relative h-[528px] w-[340px] overflow-hidden rounded-[24px] border border-white/10 shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
          >
            {/* Photo */}
            <Image
              src={expert.photo}
              alt={expert.name}
              fill
              sizes="680px"
              className="object-cover"
              style={{
                objectPosition: expert.photoPosition,
                ...(expert.photoScale ? { transform: `scale(${expert.photoScale})` } : {}),
              }}
              priority={index < 3}
            />

            {/* Desaturation overlay */}
            <div
              className="absolute inset-0 bg-[rgba(255,255,255,0.3)] mix-blend-saturation"
              aria-hidden
            />

            {/* Dark gradient */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#0a0510] from-[1%] via-[rgba(10,5,16,0.6)] via-[37%] to-transparent to-[72%]"
              aria-hidden
            />

            {/* Bottom content */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-4">
              {/* Name */}
              <h3 className="font-serif text-[25px] font-semibold leading-[28px] tracking-[-0.5px] text-white">
                {expert.name}
              </h3>

              {/* Tags */}
              <div className="flex flex-col items-start gap-2">
                {expert.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/25 bg-white/15 px-[17px] py-[5px] font-sans text-[12px] font-bold uppercase tracking-[1.2px] text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.2),0_4px_6px_-4px_rgba(0,0,0,0.2)] backdrop-blur-[2px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Logos */}
              <div className="flex h-12 items-center justify-evenly">{renderLogos(index)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default S08AcademicBoard;
