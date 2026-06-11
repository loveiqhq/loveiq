import Image from "next/image";
import type { FC } from "react";

const experts = [
  {
    name: "Dr. Dijana Galijašević",
    tags: ["Business Ethics", "Social Science"],
    photo: "/academic/dijana.jpg",
    photoPosition: "30% 15%",
    universities: ["Columbia University", "HHL Leipzig"],
  },
  {
    name: "Dr. Bruno Steinkraus",
    tags: ["Biochemistry", "Neuroscience"],
    photo: "/academic/bruno.jpg",
    photoPosition: "63% 15%",
    photoScale: 1.2,
    universities: ["Imperial College London", "University of Oxford"],
  },
  {
    name: "Dr. Quentin Ferry",
    tags: ["Machine Learning", "Molecular Biology"],
    photo: "/academic/quentin.png",
    photoPosition: "center 25%",
    universities: ["University of Oxford", "MIT"],
  },
];

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
              className={`animate-on-scroll ${index > 0 ? `stagger-${index}` : ""} relative h-[480px] w-[320px] overflow-hidden rounded-[24px] border border-black/[0.08] shadow-[0_20px_45px_rgba(0,0,0,0.10)]`}
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
              <div
                className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-transparent"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
                <h3 className="font-serif text-[24px] font-semibold leading-tight text-[#161021]">
                  {expert.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {expert.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#3f3a4d]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-[12px] font-medium text-[#6b6678]">
                  {expert.universities.join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WAcademicBoard;
