import Image from "next/image";
import type { FC } from "react";

const explorationBullets = [
  {
    title: "Clarify your inner landscape.",
    description:
      "Turn inward, and map out the desires, boundaries, and emotions you've never fully named. LoveIQ guides us with thoughtful questions so we can give language to what we feel and want.",
    mobileLines: [
      "Turn inward, and map out the desires,",
      "boundaries, and emotions you've never",
      "fully named. LoveIQ guides us with",
      "thoughtful questions so we can give",
      "language to what we feel and want.",
    ],
    icon: (
      <svg
        aria-hidden
        className="h-7 w-7"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.33331 14C2.33331 20.439 7.56097 25.6667 14 25.6667C20.439 25.6667 25.6666 20.439 25.6666 14C25.6666 7.56103 20.439 2.33337 14 2.33337C7.56097 2.33337 2.33331 7.56103 2.33331 14V14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18.9467 9.05334L16.4733 16.4733L9.05334 18.9467L11.5267 11.5267L18.9467 9.05334V9.05334"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Uncover your unique erotic signature.",
    description:
      "Discover patterns that belong only to you—no generic horoscopes here. Our science based report reveals how our mind, body, and heart connect so we can understand ourself.",
    mobileLines: [
      "Discover patterns that belong only to",
      "you—no generic horoscopes here. Our",
      "science based report reveals how our",
      "mind, body, and heart connect so we",
      "can understand ourself.",
    ],
    icon: (
      <svg
        aria-hidden
        className="h-7 w-7"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 11.6666C12.7122 11.6666 11.6667 12.7122 11.6667 14C11.6667 15.19 11.55 16.9283 11.3633 18.6666"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.3334 15.3066C16.3334 18.0833 16.3334 22.75 15.1667 25.6666"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.1717 24.5233C20.3117 23.8233 20.6734 21.84 20.755 21"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.33331 14.0001C2.33331 8.97837 5.54666 4.52009 10.3107 2.93209C15.0746 1.34409 20.3203 2.98271 23.3333 7.00006"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.33331 18.6666H2.34498"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M25.4333 18.6666C25.6667 16.3333 25.5862 12.4203 25.4333 11.6666"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.83331 22.75C6.41665 21 6.99998 17.5 6.99998 14C6.9988 13.2053 7.13294 12.4163 7.39665 11.6666"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.0917 25.6667C10.3367 24.8967 10.6167 24.1267 10.7567 23.3334"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.5 7.93331C12.6665 6.68248 15.3358 6.6829 17.5019 7.93443C19.668 9.18595 21.0016 11.4983 21 14V16.3333"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const S07SampleProfile: FC = () => {
  return (
    <section className="relative mt-0 overflow-hidden bg-[#0A0510] px-4 pb-24 pt-14 text-white">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-14">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="relative space-y-7">
            <h3 className="font-serif text-4xl leading-tight sm:text-5xl md:text-[46px]">
              <span className="block md:whitespace-nowrap">Let&apos;s explore our desires</span>
              <span className="block md:whitespace-nowrap">and connection.</span>
            </h3>
            <div className="space-y-6">
              {explorationBullets.map((item) => (
                <div key={item.title} className="group flex gap-4">
                  <div className="mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#241433]/80 text-[#cbb8ff] shadow-[0_16px_50px_rgba(0,0,0,0.35)] transition duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:border-white/20 group-hover:bg-gradient-to-br group-hover:from-[#f26d4f] group-hover:via-[#9c7dff] group-hover:to-[#5d7cff] group-hover:text-[#0d0715]">
                    {item.icon}
                  </div>
                  <div className="space-y-1">
                    <p className="font-serif text-lg font-semibold text-white">{item.title}</p>
                    <p className="text-[15px] leading-relaxed text-white/70">
                      {item.mobileLines ? (
                        <>
                          <span className="hidden sm:inline">{item.description}</span>
                          <span className="sm:hidden">
                            {item.mobileLines.map((line, idx) => (
                              <span key={line + idx} className="block">
                                {line}
                              </span>
                            ))}
                          </span>
                        </>
                      ) : (
                        item.description
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center px-2 sm:px-0">
            <div className="relative w-full max-w-[320px] overflow-hidden rounded-[34px] shadow-[0_34px_120px_rgba(0,0,0,0.5)] sm:max-w-[380px] md:max-w-[420px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-[34px] sm:aspect-auto sm:h-[600px]">
                <Image
                  src="/762ab2dcc4e38a7a2824b7a4f5174f2627a7eaae.webp"
                  alt="Couple illustration"
                  fill
                  priority
                  sizes="(max-width: 640px) 95vw, (max-width: 1024px) 480px, 540px"
                  className="object-cover object-[50%_10%] sm:object-center"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default S07SampleProfile;
