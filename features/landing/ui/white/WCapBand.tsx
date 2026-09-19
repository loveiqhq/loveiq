"use client";

import { useId, useState, type FC, type FormEvent } from "react";
import { track } from "@features/analytics/client";
import { getCsrfToken } from "@shared/http/csrf-client";

/**
 * "Not in the mood right now?" email-capture band (Figma node 8947:8550).
 * Posts to /api/test-link, which mails the person a link back to the test.
 */

type Status = "idle" | "sending" | "sent" | "error";

const WCapBand: FC = () => {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMessage("");

    try {
      const res = await fetch("/api/test-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        // 4xx messages from the route are written for people ("Please enter a
        // valid email address."). 5xx ones are not — never show "Service
        // unavailable." to a visitor.
        setMessage(
          res.status >= 500 || !data.error
            ? "We couldn't send it just now. Please try again in a moment."
            : data.error
        );
        return;
      }
      setStatus("sent");
      setMessage("Sent. Check your inbox for your test link.");
      setEmail("");
      track("cta_click", { cta: "test_link_email", location: "capband" });
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <section className="bg-white py-12 lg:py-14">
      <div className="content-shell">
        <div className="animate-on-scroll flex flex-col gap-6 rounded-[22px] border border-[#e9e6ee] bg-gradient-to-br from-[rgba(254,104,57,0.07)] to-[rgba(149,142,246,0.1)] px-6 py-8 sm:px-9 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-serif text-[22px] font-semibold text-[#161021] sm:text-[24px]">
              Not in the mood right now?
            </h2>
            <p className="max-w-[420px] text-[14.5px] leading-relaxed text-[#5f6675]">
              We&apos;ll email you a private link so you can take the test whenever you feel like
              it.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex w-full flex-col gap-2.5 lg:w-auto">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <label htmlFor={inputId} className="sr-only">
                Your email address
              </label>
              <input
                id={inputId}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="focus-visible-ring w-full rounded-xl border-[1.5px] border-[#e9e6ee] bg-white px-[15px] py-[13px] text-[15px] text-[#161021] outline-none transition placeholder:text-[#6f6a7a] focus:border-[#bf66d9] sm:w-[220px]"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="focus-visible-ring shrink-0 rounded-full bg-[#161021] px-[22px] py-3.5 text-[16px] font-semibold text-white transition duration-300 hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 motion-safe:hover:-translate-y-0.5"
              >
                {status === "sending" ? "Sending…" : "Email me my link"}
              </button>
            </div>
            <p
              aria-live="polite"
              className={`min-h-[18px] text-[13px] ${status === "error" ? "text-[#c2410c]" : "text-[#4b8f6d]"}`}
            >
              {message}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
};

export default WCapBand;
