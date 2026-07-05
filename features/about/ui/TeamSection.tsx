"use client";

import type { FC } from "react";
import Image from "next/image";
import Link from "next/link";

// Social icons
const LinkedInIcon: FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 6C14.4836 6 16.5 8.01638 16.5 10.5V15.75H13.5V10.5C13.5 9.67213 12.8279 9 12 9C11.1721 9 10.5 9.67213 10.5 10.5V15.75H7.5V10.5C7.5 8.01638 9.51638 6 12 6V6"
      stroke="#6B7280"
      strokeWidth="1.125"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M1.5 6.75H4.5V6.75V15.75V15.75H1.5V15.75V6.75V6.75V6.75"
      stroke="#6B7280"
      strokeWidth="1.125"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M1.5 3C1.5 3.82787 2.17213 4.5 3 4.5C3.82787 4.5 4.5 3.82787 4.5 3C4.5 2.17213 3.82787 1.5 3 1.5C2.17213 1.5 1.5 2.17213 1.5 3H1.5"
      stroke="#6B7280"
      strokeWidth="1.125"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TeamSection: FC = () => {
  const team = [
    {
      name: "Eman Cickusic",
      role: "Tech & Delivery Lead",
      image: "/about/team-eman-cickusic.png",
      linkedinUrl: "https://www.linkedin.com/in/eman-cickusic/",
      socials: ["linkedin"],
      hoverColor: "orange",
      imageScale: 1.5,
      imagePosition: "60% 0%",
      imageOffsetX: "5%",
      imageOffsetY: "-25%",
    },
    {
      name: "Marcus Börner",
      role: "Strategy Lead",
      // Cut from the black-background studio portrait (like Eman) → transparent
      // cutout, full hair + torso, framed to match Eman.
      image: "/about/team-marcus-borner-cut.png",
      linkedinUrl: "https://www.linkedin.com/in/marcusb1/",
      socials: ["linkedin"],
      hoverColor: "orange",
      imageScale: 0.9,
      imagePosition: "center 12%",
      imageOffsetY: "6%",
    },
  ];

  return (
    <section id="team" className="relative overflow-hidden bg-white px-6 py-16 md:py-24">
      {/* Ambient Background Glows - Left and Right */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Left gradient circle */}
        <div className="absolute -left-64 top-1/3 h-[600px] w-[600px] rounded-full bg-[#9c7dff] opacity-15 blur-[150px]" />
        {/* Right gradient circle */}
        <div className="absolute -right-64 bottom-1/4 h-[600px] w-[600px] rounded-full bg-[#9c7dff] opacity-15 blur-[150px]" />
      </div>

      <div className="content-shell relative z-10">
        {/* Header */}
        <div className="reveal-on-scroll mb-20 text-center">
          <div className="relative inline-block">
            <h2 className="font-serif text-4xl tracking-tight text-[#161021] md:text-5xl">
              Leadership Team With Vision
            </h2>
            {/* Badge */}
            <div className="absolute -right-8 -top-6 rotate-12 cursor-default rounded-full bg-[#FE6839] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_4px_10px_rgba(254,104,57,0.3)] transition-transform hover:rotate-6 md:-right-16">
              Our Team
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-light leading-relaxed text-[#6b6678]">
            We are a team of researchers, builders, and designers shaped by emerging psychology,
            lived experience, and a shared belief that self-understanding should feel clearer,
            kinder, and more human.
          </p>
        </div>

        {/* Team Grid */}
        <div className="mx-auto flex w-full max-w-[940px] flex-wrap justify-center gap-6">
          {team.map((member, index) => {
            const isPurple = member.hoverColor === "purple";
            const hoverShadow = isPurple
              ? "hover:shadow-[0_20px_40px_-12px_rgba(156,125,255,0.25)]"
              : "hover:shadow-[0_20px_40px_-12px_rgba(254,104,57,0.20)]";
            const nameHoverColor = isPurple
              ? "group-hover:text-[#7c3aed]"
              : "group-hover:text-[#FE6839]";

            return (
              <div
                key={member.name}
                className={`reveal-on-scroll stagger-${Math.min(index + 1, 4)} group w-[290px] flex-shrink-0 rounded-[2rem] border border-black/[0.08] bg-white p-4 transition-all duration-500 ease-[cubic-bezier(0.25,0.4,0.25,1)] hover:-translate-y-2 hover:border-black/[0.14] ${hoverShadow}`}
              >
                {/* Photo */}
                <div className="relative mb-5 h-[256px] w-full overflow-hidden rounded-2xl bg-[#f5f6f8]">
                  <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-white via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-60" />
                  <div
                    className="absolute inset-0"
                    style={
                      member.imageScale !== 1
                        ? {
                            transform: `${member.imageOffsetX ? `translateX(${member.imageOffsetX}) ` : ""}${member.imageOffsetY ? `translateY(${member.imageOffsetY}) ` : ""}scale(${member.imageScale})`,
                          }
                        : undefined
                    }
                  >
                    <Image
                      src={member.image}
                      alt={member.name}
                      fill
                      quality={85}
                      sizes="580px"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      style={{ objectPosition: member.imagePosition }}
                    />
                  </div>
                </div>

                {/* Info */}
                <div className="relative z-20 px-2 pb-2">
                  <h3
                    className={`mb-1 text-xl font-medium text-[#161021] transition-colors duration-300 ${nameHoverColor}`}
                  >
                    {member.name}
                  </h3>
                  <p className="mb-5 text-sm text-[#6b6678] transition-colors duration-300 group-hover:text-[#4b4753]">
                    {member.role}
                  </p>

                  {/* Social links */}
                  <div className="flex items-center gap-4 text-gray-500">
                    {member.linkedinUrl && (
                      <Link
                        href={member.linkedinUrl}
                        aria-label={`${member.name} on LinkedIn`}
                        className="transition-all duration-300 hover:scale-110 hover:text-[#161021]"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <LinkedInIcon />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
