"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";
import LegalNavSection from "@/components/legal/LegalNavSection";
import FooterSection from "@/components/landing/FooterSection";

const Pill = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span
    className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#fe6839] ${className}`}
  >
    {children}
  </span>
);

const IconCheck = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-4 w-4 text-[#fe6839]"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const IconShield = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-white">
    <path
      d="M12 3 4.5 6v6.5c0 4.174 3.009 8.06 7.5 9.5 4.491-1.44 7.5-5.326 7.5-9.5V6Z"
      fill="currentColor"
      opacity="0.3"
    />
    <path
      d="M12 3 4.5 6v6.5c0 4.174 3.009 8.06 7.5 9.5 4.491-1.44 7.5-5.326 7.5-9.5V6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
  </svg>
);

const IconShieldAlert = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-6 w-6 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 13C20 18 16.5 20.5 12.34 21.95C12.1222 22.0238 11.8855 22.0202 11.67 21.94C7.5 20.5 4 18 4 13V5.99996C4 5.44805 4.44808 4.99996 5 4.99996C7 4.99996 9.5 3.79996 11.24 2.27996C11.6777 1.90603 12.3223 1.90603 12.76 2.27996C14.51 3.80996 17 4.99996 19 4.99996C19.5523 4.99996 20 5.44768 20 5.99996V13" />
    <path d="M12 8V12" />
    <path d="M12 16H12.01" />
  </svg>
);

const IconGavel = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-6 w-6 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15.0001 12L5.62706 21.373C4.79918 22.2011 3.45471 22.2014 2.62656 21.3735C1.79841 20.5456 1.79818 19.2011 2.62606 18.373L12.0001 9" />
    <path d="M18 15L22 11" />
    <path d="M21.5 11.5L19.586 9.586C19.2109 9.21101 19.0001 8.70239 19 8.172V7.828C18.9999 7.29761 18.7891 6.78899 18.414 6.414L16.757 4.757C15.6321 3.63232 14.1067 3.00034 12.516 3H9L10.243 4.243C11.3679 5.36812 11.9999 6.89397 12 8.485V10L14 12H15.172C15.7024 12.0001 16.211 12.2109 16.586 12.586L18.5 14.5" />
  </svg>
);

const IconLock = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-4 w-4 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M9 11V8a3 3 0 0 1 6 0v3" />
  </svg>
);

const IconLockLarge = () => (
  <svg
    aria-hidden
    viewBox="0 0 32 32"
    className="h-8 w-8 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6.66667 14.6667H25.3333C26.8051 14.6667 28 15.8616 28 17.3334V26.6667C28 28.1385 26.8051 29.3334 25.3333 29.3334H6.66667C5.19489 29.3334 4 28.1385 4 26.6667V17.3334C4 15.8616 5.19489 14.6667 6.66667 14.6667V14.6667" />
    <path d="M9.3335 14.6667V9.33342C9.3335 5.65398 12.3207 2.66675 16.0002 2.66675C19.6796 2.66675 22.6668 5.65398 22.6668 9.33342V14.6667" />
  </svg>
);

const IconShieldCheck = () => (
  <svg
    aria-hidden
    viewBox="0 0 12 12"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 6.49998C10 8.99998 8.25 10.25 6.17 10.975C6.06108 11.0119 5.94277 11.0101 5.835 10.97C3.75 10.25 2 8.99998 2 6.49998V2.99998C2 2.72402 2.22404 2.49998 2.5 2.49998C3.5 2.49998 4.75 1.89998 5.62 1.13998C5.83884 0.953014 6.16116 0.953014 6.38 1.13998C7.255 1.90498 8.5 2.49998 9.5 2.49998C9.77614 2.49998 10 2.72384 10 2.99998V6.49998" />
    <path d="M4.5 6L5.5 7L7.5 5" />
  </svg>
);

const IconGlasses = () => (
  <svg
    aria-hidden
    viewBox="0 0 12 12"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 5.5C8.25 5.5 7.75 5.75 7.5 6.5" />
    <path d="M2 3C1.44808 3 1 3.44808 1 4V6C1 7.37979 2.12021 8.5 3.5 8.5C4.42386 8.53441 5.30727 8.88778 6 9.5C6.69273 8.88778 7.57614 8.53441 8.5 8.5C9.88071 8.5 11 7.38071 11 6V4C11 3.44808 10.5519 3 10 3H8.5C7.57614 3.03441 6.69273 3.38778 6 4C5.30727 3.38778 4.42386 3.03441 3.5 3L2 3" />
    <path d="M3 5.5C3.75 5.5 4.25 5.75 4.5 6.5" />
  </svg>
);

const IconUserX = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-6 w-6 text-[#fe6839]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21V19C16 16.7923 14.2077 15 12 15H6C3.79234 15 2 16.7923 2 19V21" />
    <path d="M5 7C5 8.42906 5.7624 9.74957 7 10.4641C8.2376 11.1786 9.7624 11.1786 11 10.4641C12.2376 9.74957 13 8.42906 13 7C13 4.79234 11.2077 3 9 3C6.79234 3 5 4.79234 5 7H5" />
    <path d="M17 8L22 13" />
    <path d="M22 8L17 13" />
  </svg>
);

const IconEyeOff = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="h-4 w-4 text-[#fe6839]"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7.15527 3.38412C10.3467 3.00379 13.4007 4.79587 14.6253 7.76746C14.6808 7.91713 14.6808 8.08178 14.6253 8.23145C14.3803 8.82545 14.0565 9.38379 13.6626 9.89146" />
    <path d="M9.38942 9.4386C8.60467 10.1965 7.35725 10.1857 6.58579 9.41423C5.81432 8.64277 5.80348 7.39535 6.56142 6.6106" />
    <path d="M11.6527 11.666C9.86328 12.726 7.70168 12.9563 5.7291 12.2973C3.75651 11.6382 2.16752 10.1547 1.37468 8.23202C1.31912 8.08235 1.31912 7.9177 1.37468 7.76802C1.96577 6.33459 3.00579 5.13152 4.33868 4.33936" />
    <path d="M1.3335 1.33325L14.6668 14.6666" />
  </svg>
);

const IconCircleCheck = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="h-4 w-4 text-[#4ade80]"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5341 6.66666C15.1615 9.74567 13.5537 12.8448 10.6751 14.1049C7.79655 15.365 4.42889 14.4439 2.59228 11.8943C0.755675 9.3446 0.948825 5.8586 3.05586 3.52744C5.1629 1.19627 8.61171 0.652919 11.3334 2.22332" />
    <path d="M6 7.33342L8 9.33342L14.6667 2.66675" />
  </svg>
);

const IconSparkle = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
    <path
      d="M1.3335 6.33335C1.33352 4.81465 2.26979 3.45315 3.6879 2.90962C5.10601 2.36609 6.71242 2.75305 7.7275 3.88269C7.79809 3.95817 7.89681 4.00101 8.00016 4.00101C8.10351 4.00101 8.20224 3.95817 8.27283 3.88269C9.28491 2.74549 10.8952 2.35351 12.3167 2.89834C13.7383 3.44317 14.6741 4.81103 14.6668 6.33335C14.6668 7.86002 13.6668 9.00002 12.6668 10L9.0055 13.542C8.75421 13.8306 8.39103 13.9974 8.00836 13.9998C7.62568 14.0022 7.26042 13.8401 7.0055 13.5547L3.3335 10C2.3335 9.00002 1.3335 7.86669 1.3335 6.33335Z"
      fill="#FE6839"
    />
    <path
      d="M1.3335 6.33335C1.33352 4.81465 2.26979 3.45315 3.6879 2.90962C5.10601 2.36609 6.71242 2.75305 7.7275 3.88269C7.79809 3.95817 7.89681 4.00101 8.00016 4.00101C8.10351 4.00101 8.20224 3.95817 8.27283 3.88269C9.28491 2.74549 10.8952 2.35351 12.3167 2.89834C13.7383 3.44317 14.6741 4.81103 14.6668 6.33335C14.6668 7.86002 13.6668 9.00002 12.6668 10L9.0055 13.542C8.75421 13.8306 8.39103 13.9974 8.00836 13.9998C7.62568 14.0022 7.26042 13.8401 7.0055 13.5547L3.3335 10C2.3335 9.00002 1.3335 7.86669 1.3335 6.33335V6.33335"
      stroke="#FE6839"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconScale = () => (
  <svg
    aria-hidden
    viewBox="0 0 12 12"
    className="h-3 w-3"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 1.5V10.5" />
    <path d="M9.5 4L11 8C10.1111 8.66667 8.88889 8.66667 8 8L9.5 4V3.5" />
    <path d="M1.5 3.5H2C3.3952 3.5 4.76894 3.15656 6 2.5C7.23106 3.15656 8.6048 3.5 10 3.5H10.5" />
    <path d="M2.5 4L4 8C3.11111 8.66667 1.88889 8.66667 1 8L2.5 4V3.5" />
    <path d="M3.5 10.5H8.5" />
  </svg>
);

const IconHeartHand = () => (
  <svg
    aria-hidden
    viewBox="0 0 12 12"
    className="h-3 w-3"
    fill="none"
    stroke="#FE6839"
    strokeWidth="0.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.707 7.20706C10.5 6.41406 11 5.75006 11 4.75006C11 3.61104 10.2978 2.58991 9.2342 2.18226C8.17061 1.77462 6.96581 2.06484 6.2045 2.91206C6.08942 3.01954 5.91084 3.01976 5.7955 2.91256C5.03426 2.0654 3.82957 1.77516 2.76604 2.18267C1.7025 2.59019 1.00023 3.61113 1 4.75006C1 5.90006 1.75 6.75006 2.5 7.50006L5.2675 10.1811C5.45241 10.3799 5.71024 10.495 5.98173 10.4999C6.25322 10.5048 6.51503 10.3991 6.707 10.2071C6.90581 10.008 7.01731 9.73801 7.01693 9.45665C7.01656 9.17529 6.90434 8.90563 6.705 8.70706C6.96802 8.99793 7.36992 9.12019 7.75036 9.02505C8.1308 8.92991 8.42784 8.63286 8.52298 8.25242C8.61812 7.87199 8.49587 7.47008 8.205 7.20706C8.40417 7.40626 8.67431 7.51817 8.956 7.51817C9.23769 7.51817 9.50783 7.40626 9.707 7.20706C10.0974 6.81656 10.0974 6.18356 9.707 5.79306L8.7665 4.85206C8.5405 4.62597 8.23393 4.49894 7.91425 4.49894C7.59457 4.49894 7.288 4.62597 7.062 4.85206L6.207 5.70706C5.8165 6.09745 5.1835 6.09745 4.793 5.70706C4.40262 5.31656 4.40262 4.68356 4.793 4.29306L6.2045 2.91206" />
  </svg>
);

const IconHeartHandshake = () => (
  <svg aria-hidden viewBox="0 0 31 31" className="h-6 w-6" fill="none">
    <path
      d="M25.0766 18.618C27.1252 16.5695 28.4168 14.8541 28.4168 12.2708C28.4168 10.8334 27.9808 9.42987 27.1663 8.24552C26.3519 7.06116 25.1973 6.15172 23.8552 5.6373C22.513 5.12288 21.0464 5.02769 19.649 5.3643C18.2516 5.70091 16.9892 6.45348 16.0285 7.52262M25.0766 18.618C24.8218 18.8728 24.5194 19.075 24.1865 19.2129C23.8536 19.3507 23.4968 19.4217 23.1365 19.4217C22.7762 19.4217 22.4194 19.3507 22.0865 19.2129C21.7536 19.075 21.4512 18.8728 21.1964 18.618C21.4722 18.8675 21.6945 19.1704 21.8496 19.5083C22.0048 19.8463 22.0896 20.2123 22.099 20.584C22.1083 20.9558 22.042 21.3256 21.904 21.6709C21.766 22.0163 21.5592 22.3299 21.2963 22.5929C21.0333 22.8559 20.7196 23.0626 20.3743 23.2006C20.029 23.3386 19.6592 23.4049 19.2874 23.3956C18.9157 23.3862 18.5497 23.3014 18.2117 23.1463C17.8737 22.9911 17.5708 22.7689 17.3214 22.493C17.5764 22.747 17.7788 23.0488 17.9171 23.381C18.0553 23.7133 18.1268 24.0696 18.1272 24.4295C18.1277 24.7894 18.0573 25.1458 17.9199 25.4784C17.7825 25.8111 17.5809 26.1134 17.3266 26.368C17.0811 26.6136 16.7887 26.8071 16.4668 26.9371C16.1449 27.067 15.8001 27.1308 15.453 27.1245C15.1058 27.1183 14.7636 27.0421 14.4465 26.9006C14.1295 26.7591 13.8443 26.5551 13.6079 26.3009L6.4585 19.375C4.521 17.4375 2.5835 15.2416 2.5835 12.2708C2.58378 10.8335 3.02 9.43016 3.83455 8.24601C4.6491 7.06186 5.80366 6.15262 7.14576 5.63836C8.48786 5.12411 9.95439 5.02902 11.3517 5.36567C12.7489 5.70231 14.0112 6.45485 14.9719 7.52391C15.1155 7.65738 15.3044 7.73147 15.5004 7.73123C15.6965 7.73099 15.8852 7.65644 16.0285 7.52262M25.0766 18.618C25.5609 18.1336 25.8329 17.4766 25.8329 16.7916C25.8329 16.1066 25.5609 15.4496 25.0766 14.9652L22.647 12.5343C22.3579 12.2451 22.0147 12.0157 21.6369 11.8591C21.2591 11.7026 20.8542 11.6221 20.4453 11.6221C20.0364 11.6221 19.6315 11.7026 19.2537 11.8591C18.876 12.0157 18.5327 12.2451 18.2437 12.5343L16.0349 14.743C15.5505 15.2273 14.8935 15.4994 14.2085 15.4994C13.5235 15.4994 12.8665 15.2273 12.3821 14.743C11.8978 14.2586 11.6257 13.6016 11.6257 12.9166C11.6257 12.2316 11.8978 11.5746 12.3821 11.0902L16.0285 7.52262"
      stroke="#FE6839"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HeroSection = () => (
  <section className="relative isolate flex min-h-screen flex-col overflow-hidden">
    <div className="absolute inset-0 overflow-hidden opacity-20">
      <Image
        src="/privacy/privacy-hero-bg.png"
        alt=""
        fill
        priority
        className="object-cover"
        sizes="100vw"
        style={{ objectPosition: "center 35%" }}
      />
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-[45%] bg-gradient-to-t from-[#0a0510] via-[#0a0510]/80 to-transparent" />
    <div className="absolute -bottom-[237px] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#2e0147] blur-[250px] animate-pulse-glow" />
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    <div className="content-shell relative z-10 flex flex-col items-center px-4 pt-40 pb-24 md:pt-[208px] md:pb-[176px]">
      <h1
        className="sensual-anim text-center font-serif text-4xl font-normal leading-[1.2] tracking-[-2.4px] sm:text-5xl md:text-6xl lg:text-[80px] lg:leading-[96px]"
        style={{ animationDelay: "0.2s" }}
      >
        <span className="text-white">Your privacy</span>
        <span className="mt-2 block bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff] bg-clip-text text-transparent md:mt-0">
          comes first.
        </span>
      </h1>
      <p
        className="sensual-anim mt-16 max-w-[768px] text-center text-base font-normal leading-[32px] text-[#9CA3AF] md:mt-[72px] md:text-[20px]"
        style={{ animationDelay: "0.5s" }}
      >
        At LoveIQ, trust is <span className="font-bold text-white">not a feature</span>, it is{" "}
        <span className="font-bold text-white">the foundation</span> of everything we build. We
        created a space designed to engage <span className="font-bold text-white">openly</span>,
        without fear of <span className="font-bold text-white">exposure</span>,{" "}
        <span className="font-bold text-white">misuse</span>, or{" "}
        <span className="font-bold text-white">judgment</span>.
      </p>
    </div>
  </section>
);

const HonestySection = () => (
  <section className="relative px-4 py-24 md:py-[97px]">
    <div className="content-shell flex flex-col items-center gap-24 lg:flex-row lg:items-start lg:justify-center">
      <div className="max-w-[513px] space-y-6">
        <span className="reveal-on-scroll inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1E102E] px-[13px] py-[5px] text-xs font-semibold uppercase tracking-[0.05em] text-[#fe6839]">
          <IconScale />
          Transparency
        </span>
        <h3 className="reveal-on-scroll stagger-1 font-serif text-3xl font-normal leading-[40px] text-white md:text-[36px]">
          We believe in being honest
        </h3>
        <p className="reveal-on-scroll stagger-2 text-lg leading-[29.25px] md:text-[18px]">
          <span className="font-bold text-white">
            No digital system can claim absolute, zero-risk security.{" "}
          </span>
          <span className="font-light text-[#9CA3AF]">
            The internet itself carries inherent risks.
          </span>
        </p>
        <p className="reveal-on-scroll stagger-3 text-lg font-light leading-[29.25px] text-[#9CA3AF] md:text-[18px]">
          We commit to applying the best available technical standards, and ethical principles
          available to us, to reduce risk as far as responsibly possible.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row w-full max-w-[280px] sm:max-w-[488px] gap-6 lg:mt-12">
        <div className="reveal-on-scroll group relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0F0816] px-6 py-8 transition-all duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_25px_60px_-12px_rgba(255,104,57,0.3)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_30%,rgba(254,104,57,0.18),transparent_65%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <IconShieldAlert />
          </div>
          <h4 className="text-center font-serif text-xl font-normal leading-[28px] text-white">
            Risk Awareness
          </h4>
          <p className="text-center text-sm font-normal leading-5 text-[#6b7280]">
            We acknowledge risks to
            <br />
            better mitigate them.
          </p>
        </div>
        <div className="reveal-on-scroll stagger-1 group relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0F0816] px-6 py-8 transition-all duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_25px_60px_-12px_rgba(255,104,57,0.3)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_30%,rgba(254,104,57,0.18),transparent_65%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <IconGavel />
          </div>
          <h4 className="text-center font-serif text-xl font-normal leading-[28px] text-white">
            Confidentiality
          </h4>
          <p className="text-center text-sm font-normal leading-5 text-[#6b7280]">
            Data usage is strictly limited
            <br />
            by ethics.
          </p>
        </div>
      </div>
    </div>
  </section>
);

const SecuritySection = () => (
  <section className="relative px-4 py-24 md:py-[120px]">
    <div className="content-shell flex flex-col-reverse items-center gap-12 lg:gap-24 lg:flex-row lg:items-center lg:justify-center">
      {/* Code Card */}
      <div className="reveal-on-scroll w-full max-w-[448px] overflow-hidden rounded-2xl border border-white/10 bg-[#120819] p-[33px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="mb-6 space-y-2 font-mono text-[10px] leading-[15px] text-[#4b5563]">
          <p>
            <span>01 </span>
            <span className="text-[#c084fc]">const</span>{" "}
            <span className="text-[#60a5fa]">encrypt</span> = (data) =&gt; {"{"}
          </p>
          <p>
            <span>02 </span>
            <span className="text-[#c084fc]">return</span> AES.GCM(data, key);
          </p>
          <p>03 {"}"}</p>
          <p>
            <span>04 </span>
            <span className="text-[#4ade80]">{" // Data secured at rest"}</span>
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-[#2E0147] to-[#0a0510] shadow-lg">
            <IconLockLarge />
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="font-serif text-lg font-normal leading-[28px] text-white">
              TLS 1.3 Encryption
            </h4>
            <p className="text-xs font-normal leading-4 text-[#6b7280]">
              End-to-end protection active
            </p>
          </div>
        </div>
      </div>

      {/* Text Content */}
      <div className="max-w-[472px] space-y-6">
        <span className="reveal-on-scroll inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1e102e] px-[17px] py-[5px] text-xs font-semibold uppercase tracking-[0.05em] text-[#fe6839] shadow-lg">
          <IconShieldCheck />
          Security
        </span>
        <h3 className="reveal-on-scroll stagger-1 font-serif text-[26px] md:text-[36px] font-normal leading-[32px] md:leading-[40px] text-white">
          Hardened technical security
        </h3>
        <p className="reveal-on-scroll stagger-2 text-lg leading-[29.25px] md:text-[18px]">
          <span className="font-light text-[#9CA3AF]">
            From a technical perspective, your data is protected using{" "}
          </span>
          <span className="font-bold text-[#e7e7e7]">
            modern cryptographic standards, strict access controls, and hardened database security
          </span>
          <span className="font-light text-[#9CA3AF]"> practices.</span>
        </p>
        <p className="reveal-on-scroll stagger-3 text-lg font-light leading-[29.25px] text-[#9CA3AF] md:text-[18px]">
          We use industry-standard encryption for data in transit and at rest. Identifying
          information is separated from response data wherever possible, and exposure is minimized
          by design rather than policy alone.
        </p>
      </div>
    </div>
  </section>
);

const IdentitySection = () => (
  <section className="relative px-4 py-24 md:py-[96px]">
    <div className="content-shell flex flex-col items-center gap-24 lg:flex-row lg:items-center lg:justify-center">
      {/* Text Content */}
      <div className="max-w-[472px] space-y-6">
        <span className="reveal-on-scroll inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1e102e] px-[17px] py-[5px] text-xs font-semibold uppercase tracking-[0.05em] text-[#fe6839] shadow-lg">
          <IconGlasses />
          Anonymity
        </span>
        <h3 className="reveal-on-scroll stagger-1 font-serif text-3xl font-normal leading-[40px] text-white md:text-[36px]">
          No real-world identity required
        </h3>
        <p className="reveal-on-scroll stagger-2 text-lg leading-[29.25px] md:text-[18px]">
          <span className="font-bold text-[#e8e8e8]">
            We do not require real-world information that reveals your true identity.{" "}
          </span>
          <span className="font-light text-[#9CA3AF]">
            Your name, your social presence, or your life outside this space are not relevant to us.
          </span>
        </p>
        <p className="reveal-on-scroll stagger-3 text-lg font-light leading-[29.25px] text-[#9CA3AF] md:text-[18px]">
          What truly matters is the honesty of your responses — because truthful answers are far
          more important for meaningful insight, accuracy, and personal growth than identifiable
          data ever could be. We will never sell, pass on, or share identity-linkable information.
        </p>
      </div>

      {/* Form Card */}
      <div className="reveal-on-scroll stagger-1 w-full max-w-[448px] overflow-hidden rounded-2xl border border-white/10 bg-[#0F0816] p-[33px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
        {/* Avatar and loading bars */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10">
            <IconUserX />
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-2 w-24 rounded-full bg-white/20" />
            <div className="h-2 w-16 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          {/* Name field */}
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-[13px]">
            <span className="text-xs font-normal uppercase tracking-[0.1em] text-[#6b7280]">
              Name
            </span>
            <span className="text-xs text-white/50 blur-[1.5px]">Sarah Doe</span>
            <IconEyeOff />
          </div>

          {/* Email field */}
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-[13px]">
            <span className="text-xs font-normal uppercase tracking-[0.1em] text-[#6b7280]">
              Email
            </span>
            <span className="text-xs text-white/50 blur-[1.5px]">sarahdoe@gmail.com</span>
            <IconEyeOff />
          </div>

          {/* Status field - highlighted green */}
          <div className="flex items-center justify-between rounded-lg border border-[#4ade80] bg-[rgba(34,197,94,0.1)] p-[13px]">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#4ade80]">
              Status
            </span>
            <span className="text-xs font-normal text-white">ANONYMOUS</span>
            <IconCircleCheck />
          </div>
        </div>
      </div>
    </div>
  </section>
);

const IconMail = () => (
  <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="none">
    <path
      d="M25.6668 17.5001V7.00008C25.6668 5.71228 24.6213 4.66675 23.3335 4.66675H4.66683C3.37903 4.66675 2.3335 5.71228 2.3335 7.00008V21.0001C2.3335 22.2834 3.3835 23.3334 4.66683 23.3334H14.0002"
      stroke="#FE6839"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M25.6668 8.16675L15.2018 14.8167C14.4669 15.2772 13.5334 15.2772 12.7985 14.8167L2.3335 8.16675"
      stroke="#FE6839"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.6665 22.1667H25.6665"
      stroke="#FE6839"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BoundariesSection = () => (
  <section className="relative px-4 py-20 md:py-[80px]">
    <div className="content-shell flex flex-col items-center gap-12">
      <h3 className="reveal-on-scroll text-center font-serif text-[30px] leading-[36px] text-white">
        Respecting your boundaries
      </h3>
      <div className="flex w-full flex-col gap-8 md:flex-row md:justify-center">
        <div className="reveal-on-scroll group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1A0B25] to-[#0A0510] p-8 md:w-[488px] transition-all duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_25px_60px_-12px_rgba(254,104,57,0.25)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_25%,rgba(254,104,57,0.18),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FE6839]/10 text-[#FE6839] animate-icon-float">
            <IconMail />
          </div>
          <div className="mt-6 space-y-4">
            <h4 className="font-serif text-[20px] leading-[28px] text-white">Use an alias email</h4>
            <p className="text-[16px] font-light leading-[26px] text-[#9CA3AF]">
              If it feels safer, we welcome your to use an anonymous or alias email address. Many
              choose this option. Your experience, report quality, and access to insights remain
              exactly the same.
            </p>
          </div>
        </div>
        <div className="reveal-on-scroll stagger-1 group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1A0B25] to-[#0A0510] p-8 md:w-[501px] transition-all duration-500 ease-out transform-gpu hover:-translate-y-2 hover:shadow-[0_25px_60px_-12px_rgba(254,104,57,0.25)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_25%,rgba(254,104,57,0.18),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FE6839]/10 text-[#FE6839] animate-icon-float"
            style={{ animationDelay: "0.5s" }}
          >
            <IconHeartHandshake />
          </div>
          <div className="mt-6 space-y-4">
            <h4 className="font-serif text-[20px] leading-[28px] text-white">
              A non-judgmental space
            </h4>
            <p className="text-[16px] font-light leading-[26px] text-[#9CA3AF]">
              LoveIQ is built to be safe, discreet, non-judgmental, and respectful of your
              boundaries. You can focus on understanding yourself, not protecting yourself from
              scrutiny.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const SafeHavenSection = () => (
  <section className="relative px-4 py-24 md:py-[97px]">
    <div className="content-shell mx-auto max-w-[896px]">
      <div className="flex flex-col items-center gap-16 md:gap-20 px-6">
        <h2 className="reveal-on-scroll text-center font-serif text-[32px] leading-[40px] text-white md:text-[48px] md:leading-[48px]">
          {/* Mobile line breaks */}
          <span className="md:hidden">
            Delivering a safe
            <br />
            haven for your
            <br />
            most intimate reflections
          </span>
          {/* Desktop line breaks */}
          <span className="hidden md:inline">
            Delivering a safe haven for
            <br />
            your most intimate reflections
          </span>
        </h2>
        <p className="reveal-on-scroll stagger-1 max-w-[908px] text-center text-lg leading-[28px] md:text-[20px]">
          <span className="font-light text-[#9CA3AF]">We understand that </span>
          <span className="font-bold text-[#ededed]">
            reflecting on intimacy and identity requires a level of safety that goes beyond standard
            digital products.
          </span>
        </p>
      </div>
    </div>
  </section>
);

const UnderstandingSection = () => (
  <section className="relative px-6 py-24 md:py-[128px]">
    <div className="content-shell flex flex-col-reverse items-center gap-10 lg:flex-row lg:justify-center lg:gap-20">
      {/* Image with Overlay Card */}
      <div className="reveal-on-scroll relative aspect-square w-full max-w-[484px] overflow-hidden rounded-2xl">
        <Image
          src="/privacy/privacy-portrait.png"
          alt="Calm reflective portrait"
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 484px, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0510] via-[#2E0147]/50 to-transparent opacity-80" />

        {/* Overlay Card */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex w-[240px] md:w-[320px] flex-col items-center gap-1 md:gap-2 rounded-[16px] border border-white/10 bg-[#1A0B25]/80 px-5 py-5 md:px-10 md:py-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] backdrop-blur-[6px]">
          <div className="mb-2 md:mb-4 flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-full bg-[#FE6839]/10">
            <IconHeartHandshake />
          </div>
          <h4 className="font-serif text-lg md:text-2xl leading-[24px] md:leading-[32px] text-white">
            We are here for you.
          </h4>
          <p className="mb-2 md:mb-4 text-center text-xs md:text-sm leading-[18px] md:leading-[20px] text-white/70">
            And honestly — we built this for ourselves too, so we could feel safe, open, and
            understood within our own team
          </p>
          <span className="rounded-full bg-[#FE6839]/10 px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-xs font-medium text-[#fe6839]">
            Emotionally Safe Zone
          </span>
        </div>
      </div>

      {/* Text Content */}
      <div className="flex max-w-[484px] flex-col gap-6">
        <span className="reveal-on-scroll inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#1E102E] px-[13px] py-[5px] text-xs font-semibold uppercase tracking-[0.05em] text-[#fe6839]">
          <IconHeartHand />
          Unconditional Regard
        </span>
        <h3 className="reveal-on-scroll stagger-1 font-serif text-4xl leading-[48px] tracking-[-1.2px] text-white md:text-[48px]">
          No judgment.
          <br />
          Just insights.
        </h3>
        <div className="reveal-on-scroll stagger-2 space-y-4 text-[20px] leading-[29.25px] text-[#9CA3AF]">
          <p>
            The world can be loud with opinions. Here, there are only insights. Whether we are
            navigating heartbreak, confusion, or joy, our feelings are valid simply because we feel
            them.
          </p>
          <p>We created LoveIQ to be the one place where you don&apos;t have to pretend.</p>
        </div>
      </div>
    </div>
  </section>
);

const IconFlask = () => (
  <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none">
    <path
      d="M5 15H11.6667"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 18.3333H17.5"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.6668 18.3333C14.8863 18.3333 17.5002 15.7195 17.5002 12.5C17.5002 9.28049 14.8863 6.66666 11.6668 6.66666H10.8335"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 11.6667H9.16667"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.50016 10C6.57969 10 5.8335 9.25381 5.8335 8.33333V5H10.8335V8.33333C10.8335 9.25381 10.0873 10 9.16683 10H7.50016"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.99984 5V2.5C9.99984 2.03976 9.62674 1.66666 9.1665 1.66666H7.49984C7.0396 1.66666 6.6665 2.03976 6.6665 2.5V5"
      stroke="#FE6839"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconHeart = () => (
  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
    <path
      d="M9.707 7.207C10.5 6.414 11 5.75 11 4.75C11 3.61098 10.2978 2.58985 9.2342 2.1822C8.17061 1.77456 6.96581 2.06477 6.2045 2.912C6.08942 3.01948 5.91084 3.0197 5.7955 2.9125C5.03426 2.06534 3.82957 1.7751 2.76604 2.18261C1.7025 2.59013 1.00023 3.61107 1 4.75C1 5.9 1.75 6.75 2.5 7.5L5.2675 10.181C5.45241 10.3798 5.71024 10.4949 5.98173 10.4998C6.25322 10.5047 6.51503 10.399 6.707 10.207C6.90581 10.0079 7.01731 9.73795 7.01693 9.45659C7.01656 9.17523 6.90434 8.90556 6.705 8.707C6.96802 8.99787 7.36992 9.12012 7.75036 9.02498C8.1308 8.92985 8.42784 8.6328 8.52298 8.25236C8.61812 7.87193 8.49587 7.47002 8.205 7.207C8.40417 7.4062 8.67431 7.51811 8.956 7.51811C9.23769 7.51811 9.50783 7.4062 9.707 7.207C10.0974 6.8165 10.0974 6.1835 9.707 5.793L8.7665 4.852C8.5405 4.62591 8.23393 4.49888 7.91425 4.49888C7.59457 4.49888 7.288 4.62591 7.062 4.852L6.207 5.707C5.8165 6.09739 5.1835 6.09739 4.793 5.707C4.40262 5.3165 4.40262 4.6835 4.793 4.293L6.2045 2.912"
      stroke="#FE6839"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ResearchSection = () => (
  <section className="relative px-4 md:px-6 py-24 md:py-[96px]">
    <div className="content-shell flex flex-col items-center gap-10 lg:flex-row lg:justify-center lg:gap-24">
      {/* Text Content */}
      <div className="max-w-[468px] space-y-6">
        <span className="reveal-on-scroll inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1e102e] px-[17px] py-[5px] text-xs font-semibold uppercase tracking-[0.6px] text-[#fe6839] shadow-lg">
          <IconHeart />
          Impact
        </span>
        <h3 className="reveal-on-scroll stagger-1 font-serif text-[28px] md:text-[36px] leading-[34px] md:leading-[40px] text-white">
          Scientific &amp; societal progress
        </h3>
        <p className="reveal-on-scroll stagger-2 text-base md:text-[18px] leading-[26px] md:leading-[29.25px]">
          <span className="font-light text-[#9CA3AF]">For scientific progress, </span>
          <span className="font-bold text-[#ededed]">
            we may use fully anonymized, non-personal, and non-reidentifiable data{" "}
          </span>
          <span className="font-light text-[#9CA3AF]">for research purposes.</span>
        </p>
        <p className="reveal-on-scroll stagger-3 text-base md:text-[18px] leading-[26px] md:leading-[29.25px]">
          <span className="font-light text-[#9CA3AF]">This </span>
          <span className="font-bold text-[#ededed]">
            data cannot be traced back to individuals{" "}
          </span>
          <span className="font-light text-[#9CA3AF]">
            and is used exclusively to advance understanding in areas such as sexuality, attachment,
            well-being, and human flourishing — always in service of reducing suffering and
            increasing human happiness.
          </span>
        </p>
      </div>

      {/* Image Card */}
      <div className="reveal-on-scroll relative h-[380px] md:h-[576px] w-full max-w-[448px] overflow-hidden rounded-3xl border border-white/10">
        <Image
          src="/privacy/privacy-research.png"
          alt="Scientific research abstract"
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 448px, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0A0510] via-[#2E0147]/50 to-transparent" />

        {/* Bottom Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md">
              <IconFlask />
            </div>
            <span className="font-serif text-lg leading-[28px] text-white">Research Lab</span>
          </div>
          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-[#fe6839] animate-gradient-move" />
          </div>
          <div className="flex items-center justify-start text-[10px] uppercase tracking-[0.5px] text-[#d1d5db]">
            <span>Processing Data</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const IconEncrypted = () => (
  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
    <path
      d="M10 6.50001C10 9.00001 8.25 10.25 6.17 10.975C6.06108 11.0119 5.94277 11.0102 5.835 10.97C3.75 10.25 2 9.00001 2 6.50001V3.00001C2 2.72405 2.22404 2.50001 2.5 2.50001C3.5 2.50001 4.75 1.90001 5.62 1.14001C5.83884 0.953045 6.16116 0.953045 6.38 1.14001C7.255 1.90501 8.5 2.50001 9.5 2.50001C9.77614 2.50001 10 2.72387 10 3.00001V6.50001"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 6L5.5 7L7.5 5"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconAnonymous = () => (
  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
    <path
      d="M4.5 5H4.505"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 5H7.505"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 1C3.79234 1 2 2.79234 2 5V11L3.5 9.5L4.75 10.75L6 9.5L7.25 10.75L8.5 9.5L10 11V5C10 2.79234 8.20766 1 6 1V1"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconSafeZone = () => (
  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
    <path
      d="M1 4.75002C1.00002 3.61099 1.70222 2.58986 2.7658 2.18222C3.82939 1.77457 5.03419 2.06479 5.7955 2.91202C5.84845 2.96863 5.92249 3.00076 6 3.00076C6.07751 3.00076 6.15155 2.96863 6.2045 2.91202C6.96356 2.05912 8.17131 1.76514 9.23744 2.17376C10.3036 2.58238 11.0054 3.60827 11 4.75002C11 5.89502 10.25 6.75002 9.5 7.50002L6.754 10.1565C6.56553 10.373 6.29315 10.498 6.00614 10.4998C5.71914 10.5017 5.44519 10.3801 5.254 10.166L2.5 7.50002C1.75 6.75002 1 5.90002 1 4.75002"
      stroke="white"
      strokeOpacity="0.4"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const QuoteSection = () => (
  <section className="relative overflow-hidden bg-white/[0.02] px-4 pt-[37px] pb-24">
    <div className="content-shell relative flex flex-col items-center gap-5 py-8 text-center">
      {/* Purple blur background - centered behind content */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {/* Main purple glow - centered */}
        <div className="absolute h-[250px] w-[250px] md:h-[600px] md:w-[600px] rounded-full bg-[#4a0d6e] blur-[80px] md:blur-[150px] opacity-30 md:opacity-50 animate-pulse-glow" />
        {/* Inner concentrated glow for intensity */}
        <div
          className="absolute h-[150px] w-[150px] md:h-[400px] md:w-[400px] rounded-full bg-[#6b21a8] blur-[60px] md:blur-[100px] opacity-25 md:opacity-40 animate-pulse-glow"
          style={{ animationDelay: "1s" }}
        />
      </div>
      <p className="reveal-on-scroll relative z-10 mx-auto max-w-[900px] font-serif text-[28px] leading-[36px] md:text-[48px] md:leading-[56px] tracking-[-1.2px] text-white">
        &quot;This is a space designed for honest reflection — even on thoughts and desires
        we&apos;ve never spoken aloud.&quot;
      </p>

      <div className="relative z-10 flex flex-col items-center gap-6 pt-6">
        <Link
          href="/survey"
          className="reveal-on-scroll stagger-1 group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-6 py-3 text-[16px] font-semibold leading-6 text-white shadow-pill transition hover:-translate-y-[2px] focus-visible-ring"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <div
            aria-hidden
            className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
          />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition duration-300 group-hover:opacity-100" />
          <span className="pointer-events-none absolute inset-[-12%] rounded-full border border-white/15 mix-blend-screen opacity-70" />
          <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
            Start survey now
          </span>
          <svg
            aria-hidden
            className="relative z-10 h-5 w-5 transition-colors duration-500 group-hover:text-black"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>

        <div className="reveal-on-scroll stagger-2 flex items-center gap-2 text-[10px] sm:text-sm font-bold uppercase tracking-[1px] text-white/40">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <IconEncrypted />
            Encrypted
          </span>
          <span className="h-1 w-1 rounded-full bg-white/40" />
          <span className="flex items-center gap-1 whitespace-nowrap">
            <IconAnonymous />
            Anonymous
          </span>
          <span className="h-1 w-1 rounded-full bg-white/40" />
          <span className="flex items-center gap-1 whitespace-nowrap">
            <IconSafeZone />
            Safe Zone
          </span>
        </div>
      </div>
    </div>
  </section>
);

const EthicalPledgeSection = () => (
  <section className="relative px-4 py-24">
    <div className="content-shell flex justify-center">
      <div className="reveal-on-scroll relative w-full max-w-[996px] overflow-hidden rounded-[32px] border border-white/10 bg-[#13081A] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="pointer-events-none absolute right-10 top-0 h-64 w-64 rounded-full bg-[#2E0147]/25 blur-[160px] animate-pulse-glow" />
        <div className="grid overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative flex flex-col justify-center gap-6 px-8 py-12 md:px-12">
            <Pill className="reveal-on-scroll w-fit">
              <IconSparkle />
              Our Ethical Pledge
            </Pill>
            <h3 className="reveal-on-scroll stagger-1 font-serif text-3xl leading-[1.1] text-white md:text-4xl">
              Built by humans,
              <br />
              for humans.
            </h3>
            <p className="reveal-on-scroll stagger-2 text-base leading-[1.7] text-[#9CA3AF]">
              We believe that emotional data is sacred. It is not just &quot;content&quot; - it is
              the fabric of your life.
            </p>
            <p className="reveal-on-scroll stagger-3 text-base leading-[1.7] text-[#9CA3AF]">
              We promise to treat vulnerability with the same reverence as a therapist. We use data
              only to improve the tool, never to manipulate our choices or emotions.
            </p>
            <Link
              href="/privacy-policy"
              className="reveal-on-scroll stagger-4 inline-flex w-fit items-center justify-center gap-2 rounded-full border border-[#FE6839]/40 px-6 py-3 text-sm font-semibold text-[#FE6839] transition-all duration-75 hover:-translate-y-[2px] hover:border-[#FE6839]/70 hover:text-white"
            >
              Read our Privacy Policy
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="relative h-[360px] w-full overflow-hidden md:h-[520px]">
            <Image
              src="/privacy/builtByHumans.png"
              alt="Built by humans, for humans"
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 450px, 100vw"
              style={{ objectPosition: "50% 35%", transform: "scale(1.7)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#13081A] via-transparent to-transparent" />
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default function TrustZonePage() {
  // Scroll reveal animation observer (same pattern as About page)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observerOptions = {
      root: null,
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe all reveal elements
    const elements = document.querySelectorAll(".reveal-on-scroll");
    elements.forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <LegalNavSection />
      <main className="relative bg-[#0A0510] text-white">
        <HeroSection />
        <HonestySection />
        <SecuritySection />
        <IdentitySection />
        <BoundariesSection />
        <SafeHavenSection />
        <UnderstandingSection />
        <EthicalPledgeSection />
        <ResearchSection />
        <QuoteSection />
        <FooterSection />
      </main>
    </>
  );
}
