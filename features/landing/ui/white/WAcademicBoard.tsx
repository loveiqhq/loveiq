import Image from "next/image";
import type { FC } from "react";

/**
 * Academic board section: photo card + dark gradient at the base + university
 * logos. The Person/E-E-A-T JSON-LD for these board members is emitted from
 * app/page.tsx — keep the names here in sync with that schema.
 */

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
    case 0:
      return (
        <>
          <Image
            src="/academic/columbia-logo.svg"
            alt="Columbia University logo"
            width={58}
            height={40}
            style={{ transform: "scaleY(-1)" }}
          />
          <Image src="/academic/hhl-logo.svg" alt="HHL Leipzig logo" width={136} height={34} />
        </>
      );
    case 1:
      return (
        <>
          <Image
            src="/academic/icl-logo.svg"
            alt="Imperial College London logo"
            width={107}
            height={28}
            style={{ transform: "scaleY(-1)" }}
          />
          <Image
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            width={128}
            height={38}
            style={{ transform: "scaleY(-1)" }}
          />
        </>
      );
    case 2:
      return (
        <>
          <Image
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            width={115}
            height={34}
            style={{ transform: "scaleY(-1)" }}
          />
          <Image src="/academic/mit-logo.svg" alt="MIT logo" width={75} height={40} />
        </>
      );
    default:
      return null;
  }
};

const WAcademicBoard: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24" aria-labelledby="w-academic-board-heading">
      <div className="content-shell flex flex-col items-center">
        <h2
          id="w-academic-board-heading"
          className="animate-on-scroll max-w-3xl text-center font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-4xl lg:text-5xl"
        >
          Supported by academic multidisciplinary expertise
        </h2>

        <div className="mt-12 flex flex-wrap justify-center gap-6">
          {experts.map((expert, index) => (
            <div
              key={expert.name}
              className={`animate-on-scroll ${index > 0 ? `stagger-${index}` : ""} relative h-[480px] w-[320px] overflow-hidden rounded-[24px] border border-black/[0.08] shadow-[0_20px_45px_rgba(0,0,0,0.12)]`}
            >
              <Image
                src={expert.photo}
                alt={expert.name}
                fill
                sizes="640px"
                className="object-cover"
                style={{
                  objectPosition: expert.photoPosition,
                  ...(expert.photoScale ? { transform: `scale(${expert.photoScale})` } : {}),
                }}
              />
              {/* Dark gradient at the base for legibility (replaces the old white fade). */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#0a0510] from-[1%] via-[rgba(10,5,16,0.55)] via-[34%] to-transparent to-[70%]"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-4">
                <h3 className="font-serif text-[25px] font-semibold leading-[28px] tracking-[-0.5px] text-white">
                  {expert.name}
                </h3>
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
                <div className="flex h-12 items-center justify-evenly">{renderLogos(index)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WAcademicBoard;
