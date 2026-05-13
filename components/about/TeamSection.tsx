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

const TwitterIcon: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#6b7280">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GlobeIcon: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#6b7280"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const DribbbleIcon: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#6b7280">
    <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12 12-5.373 12-12S18.628 0 12 0zm9.885 11.441c-2.575-.422-4.943-.445-7.103-.073a42.153 42.153 0 0 0-.767-1.68c2.316-1 4.108-2.276 5.363-3.822a9.857 9.857 0 0 1 2.507 5.575zm-3.842-6.91c-1.139 1.398-2.817 2.56-5.028 3.476a42.566 42.566 0 0 0-3.387-5.292 9.9 9.9 0 0 1 8.415 1.816zM7.73 3.615a40.51 40.51 0 0 1 3.407 5.227c-2.617.895-5.695 1.347-9.21 1.347-.082 0-.164-.001-.246-.001a9.902 9.902 0 0 1 6.049-6.573zM2.115 12.003c0-.032.001-.065.002-.097.082.001.165.002.248.002 4.012 0 7.509-.552 10.492-1.653.235.494.456.993.664 1.497-3.633 1.147-6.4 3.253-8.303 6.317a9.862 9.862 0 0 1-3.103-6.066zm4.456 7.379c1.745-2.834 4.27-4.78 7.584-5.842.814 2.115 1.415 4.35 1.802 6.708a9.855 9.855 0 0 1-9.386-.866zm10.931-.181a40.483 40.483 0 0 0-1.649-6.283c1.936-.283 4.058-.214 6.365.207a9.887 9.887 0 0 1-4.716 6.076z" />
  </svg>
);

const TeamSection: FC = () => {
  const team = [
    {
      name: "Ema Djedović",
      role: "Product Lead",
      image: "/about/team-ema-djedovic.png",
      linkedinUrl: "https://www.linkedin.com/in/ema-djedovic/",
      socials: ["linkedin"],
      hoverColor: "purple",
      imageScale: 1,
      imagePosition: "center 20%",
    },
    {
      name: "Eman Cickusic",
      role: "Tech Lead",
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
      name: "Ferhad Jukić",
      role: "Full-Stack Engineer",
      image: "/about/team-ferhad-jukic-new.png",
      linkedinUrl: "https://www.linkedin.com/in/ferhad-juki%C4%87-7a9049333/",
      socials: ["linkedin"],
      hoverColor: "purple",
      imageScale: 1,
      imagePosition: "center 50%",
    },
    // {
    //   name: "Adna Njuhović",
    //   role: "Growth Lead",
    //   image: "/about/team-adna-njuhovic.png",
    //   linkedinUrl: "https://www.linkedin.com/in/adna-njuhovic/",
    //   socials: ["linkedin"],
    //   hoverColor: "orange",
    //   imageScale: 1.05,
    //   imagePosition: "center 25%",
    // },
    {
      name: "Ismar Fazlić",
      role: "Design Lead",
      image: "/about/team-ismar-fazlic.png",
      linkedinUrl: "https://www.linkedin.com/in/ismar-fazlic/",
      socials: ["linkedin"],
      hoverColor: "purple",
      imageScale: 1.35,
      imagePosition: "center 15%",
    },
    {
      name: "Marcus Börner",
      role: "Strategy Lead",
      image: "/about/marcus.png",
      linkedinUrl: "https://www.linkedin.com/in/marcusb1/",
      socials: ["linkedin"],
      hoverColor: "orange",
      imageScale: 1,
      imagePosition: "center 0%",
      imageOffsetY: "-20%",
    },
  ];

  const getSocialIcon = (social: string) => {
    switch (social) {
      case "linkedin":
        return <LinkedInIcon />;
      case "twitter":
        return <TwitterIcon />;
      case "globe":
        return <GlobeIcon />;
      case "dribbble":
        return <DribbbleIcon />;
      default:
        return null;
    }
  };

  return (
    <section
      id="team"
      className="relative overflow-hidden border-t border-white/5 bg-[#0A0510] px-6 py-16 md:py-24"
    >
      {/* Ambient Background Glows - Left and Right */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Left gradient circle */}
        <div className="absolute -left-64 top-1/3 h-[600px] w-[600px] rounded-full bg-[#2E0147] opacity-30 blur-[150px]" />
        {/* Right gradient circle */}
        <div className="absolute -right-64 bottom-1/4 h-[600px] w-[600px] rounded-full bg-[#2E0147] opacity-30 blur-[150px]" />
      </div>

      <div className="content-shell relative z-10">
        {/* Header */}
        <div className="reveal-on-scroll mb-20 text-center">
          <div className="relative inline-block">
            <h2 className="font-serif text-4xl tracking-tight text-white md:text-5xl">
              Leadership Team With Vision
            </h2>
            {/* Badge */}
            <div className="absolute -right-8 -top-6 rotate-12 cursor-default rounded-full bg-[#FE6839] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_4px_10px_rgba(254,104,57,0.3)] transition-transform hover:rotate-6 md:-right-16">
              Our Team
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-light leading-relaxed text-gray-400">
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
              ? "hover:shadow-[0_20px_40px_-12px_rgba(46,1,71,0.5)]"
              : "hover:shadow-[0_20px_40px_-12px_rgba(254,104,57,0.3)]";
            const nameHoverColor = isPurple
              ? "group-hover:text-[#a855f7]"
              : "group-hover:text-[#FE6839]";

            return (
              <div
                key={member.name}
                className={`reveal-on-scroll stagger-${Math.min(index + 1, 4)} group w-[290px] flex-shrink-0 rounded-[2rem] border border-white/5 bg-[#120B1C] p-4 transition-all duration-500 ease-[cubic-bezier(0.25,0.4,0.25,1)] hover:-translate-y-2 hover:border-white/20 hover:bg-[#1a1025] ${hoverShadow}`}
              >
                {/* Photo */}
                <div className="relative mb-5 h-[256px] w-full overflow-hidden rounded-2xl bg-[#0A0510]">
                  <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#0A0510] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-60" />
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
                    className={`mb-1 text-xl font-medium text-white transition-colors duration-300 ${nameHoverColor}`}
                  >
                    {member.name}
                  </h3>
                  <p className="mb-5 text-sm text-gray-500 transition-colors duration-300 group-hover:text-gray-400">
                    {member.role}
                  </p>

                  {/* Social links */}
                  <div className="flex items-center gap-4 text-gray-500">
                    {member.linkedinUrl && (
                      <Link
                        href={member.linkedinUrl}
                        aria-label={`${member.name} on LinkedIn`}
                        className="transition-all duration-300 hover:scale-110 hover:text-white"
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
