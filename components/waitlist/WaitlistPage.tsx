"use client";

import Image from "next/image";
import { useState } from "react";
import { trackWaitlistSignup } from "@/lib/analytics";

const faqs = [
  {
    question: "What is LoveIQ Early Access?",
    answer:
      "Early Access members get priority entry to our platform before the public launch, exclusive content, and a locked-in lifetime discount on premium features.",
  },
  {
    question: "What's included in the test?",
    answer:
      "Our comprehensive assessment covers 5 key psychological dimensions of intimacy. You'll receive a detailed report outlining your unique profile immediately after completion.",
  },
  {
    question: "Is there support available?",
    answer:
      "Yes! Our team of relationship psychologists and support staff are available to help interpret your results and guide you through the platform.",
  },
  {
    question: "How much will this cost?",
    answer:
      "Joining the waitlist is free. The basic assessment is free, while deeper analytical reports will be available for a one-time fee or subscription.",
  },
];

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem = ({ question, answer }: FAQItemProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/5 bg-white/5 transition-all duration-300 hover:bg-white/10 ${isOpen ? "bg-white/10" : ""}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer select-none items-center justify-between px-5 py-4 sm:px-6 sm:py-5 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-white sm:text-base">{question}</span>
        <span
          className={`text-white/50 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div
            className={`px-5 pb-4 pt-0 text-sm leading-relaxed text-gray-300 sm:px-6 transition-all duration-300 ease-out ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-8px]"}`}
          >
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
};

const avatars = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&h=64",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&h=64",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=64&h=64",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=64&h=64",
];

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid email.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      // Get CSRF token from cookie (__Host-csrf in production, __csrf in dev)
      const csrfCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
      const csrfToken = csrfCookie?.substring(csrfCookie.indexOf("=") + 1) || "";

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ email, source: "waitlist-page", website }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Something went wrong");
      }
      setStatus("success");
      trackWaitlistSignup("waitlist_page");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unable to join waitlist.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0510] text-white">
      {/* Purple gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] h-[500px] w-[500px] md:h-[800px] md:w-[800px] rounded-full bg-[radial-gradient(circle,rgba(84,20,117,0.7)_0%,rgba(84,20,117,0)_70%)] animate-float-up-down" />
        <div className="absolute bottom-[-20%] right-[-20%] h-[500px] w-[500px] md:h-[800px] md:w-[800px] rounded-full bg-[radial-gradient(circle,rgba(84,20,117,0.7)_0%,rgba(84,20,117,0)_70%)] animate-float-up-down-reverse" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-14 sm:px-6 md:py-16">
        <div className="relative w-full max-w-4xl rounded-[32px] border border-white/10 bg-[rgba(10,5,16,0.8)] backdrop-blur-xl px-6 py-10 shadow-[0_24px_120px_rgba(0,0,0,0.55)] sm:px-10 sm:py-12">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#541475] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#541475]" />
              </span>
              <span>Available in early 2026</span>
            </div>
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl">
              Get Early Access
            </h1>
            <p className="max-w-2xl text-sm text-white/70 sm:text-base">
              Be amongst the first to experience the new standard in relationship psychology. Sign
              up to be notified when we launch.
            </p>
          </div>

          {status === "success" ? (
            <div
              className="mx-auto mb-6 flex w-full max-w-xl animate-fade-in-up flex-col items-center py-12"
              role="status"
              aria-live="polite"
            >
              {/* Gradient-bordered checkmark circle */}
              <div className="relative mb-6 flex h-16 w-16 animate-scale-in items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FE6839] to-[#9c7dff] opacity-60 blur-xl"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FE6839] to-[#9c7dff]"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-[2px] rounded-full bg-[#0A0510]"
                  aria-hidden="true"
                />
                <svg
                  className="relative h-7 w-7 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-serif text-2xl text-white">You&apos;re In!</h3>
              <p className="mt-2 text-sm text-white/70">
                Check your email for confirmation details
              </p>
            </div>
          ) : (
            <form
              className="mx-auto mb-6 flex w-full max-w-xl flex-col gap-3"
              noValidate
              onSubmit={(evt) => {
                evt.preventDefault();
                if (status !== "loading") {
                  handleSubmit();
                }
              }}
            >
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <div className="grid grid-cols-[1fr_auto] items-stretch gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-xl shadow-black/20 transition-colors hover:bg-white/10 focus-within:border-[#FE6839]/50 focus-within:ring-1 focus-within:ring-[#FE6839]/50 sm:gap-3 sm:rounded-full sm:p-2 sm:pl-4">
                <input
                  type="email"
                  name="email"
                  aria-label="Email address"
                  className="h-12 min-w-0 w-full border-none bg-transparent pr-3 text-base text-white placeholder-white/60 focus:outline-none focus:ring-0 sm:pr-12"
                  placeholder="name@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    if (status !== "loading") handleSubmit();
                  }}
                  className="justify-self-end whitespace-nowrap rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-pill transition-colors sm:px-7 sm:py-3 sm:text-base disabled:opacity-100 disabled:cursor-pointer"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "Submitting..." : "Join waitlist"}
                </button>
              </div>
              <div className="min-h-[32px]" aria-live="polite" role="status">
                {status === "error" && errorMessage && (
                  <p className="inline-flex items-center gap-2 rounded-full bg-[#2a0f15] px-4 py-2 text-sm font-semibold text-[#fca5a5] shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                    <span className="h-2 w-2 rounded-full bg-[#fca5a5]" aria-hidden />
                    {errorMessage}
                  </p>
                )}
              </div>
            </form>
          )}

          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="-space-x-3 flex">
              {avatars.map((src, idx) => (
                <Image
                  key={src}
                  className="inline-block h-8 w-8 rounded-full ring-2 ring-[#0A0510]"
                  src={src}
                  alt={`Waitlist avatar ${idx + 1}`}
                  width={32}
                  height={32}
                />
              ))}
            </div>
            <span className="text-sm text-white/70">
              Join the <strong className="font-semibold text-white">fast-growing</strong>{" "}
              early-access waitlist
            </span>
          </div>

          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="font-serif text-2xl sm:text-3xl">Frequently Asked Questions</h2>
            <p className="text-xs text-white/60 sm:text-sm">
              Everything you need to know about the early access.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {faqs.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-400">
            <a href="/privacy-policy" className="hover:text-white/70 transition-colors">
              Privacy Policy
            </a>
            <span className="text-gray-400">&gt;</span>
            <a href="/terms-of-use" className="hover:text-white/70 transition-colors">
              Terms of Use
            </a>
            <span className="text-gray-400">&gt;</span>
            <a href="/medical-disclaimer" className="hover:text-white/70 transition-colors">
              Medical &amp; Psychological Disclaimer
            </a>
          </div>
          <div className="mt-2 text-center text-[10px] text-gray-400">
            Ac 2026 LoveIQ &gt; Designed based on User Request
          </div>
        </div>
      </div>
    </div>
  );
}
