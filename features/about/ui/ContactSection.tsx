"use client";

import type { ChangeEvent, FC, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useNonce } from "@shared/ui/NonceProvider";

type FormFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  // R-15: optional inline error message. When set:
  //   - aria-invalid="true" announces the input as in error state
  //   - aria-describedby links the error element so screen readers narrate
  //     the message immediately after the label
  error?: string | null;
};

const FormField: FC<FormFieldProps> = ({
  id,
  label,
  type = "text",
  value,
  onChange,
  disabled,
  error,
}) => {
  const errorId = `${id}-error`;
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[#6b6678]">{label}</span>
      <input
        id={id}
        name={id}
        type={type}
        className="h-[49px] w-full border-b border-black/[0.14] bg-transparent text-sm text-[#161021] transition focus:border-[#161021] focus:outline-none focus:ring-0 disabled:opacity-60"
        value={value}
        onChange={onChange}
        required
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
};

const ContactSection: FC = () => {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({
    type: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const nonce = useNonce();
  const getGrecaptcha = () => {
    if (typeof window === "undefined") return undefined;
    const g = (
      window as unknown as {
        grecaptcha?: {
          render?: Function;
          reset?: (id?: number) => void;
          getResponse?: (id?: number) => string;
        };
      }
    ).grecaptcha;
    // Only return grecaptcha if render is available (API fully loaded)
    if (g && typeof g.render === "function")
      return g as {
        render: Function;
        reset: (id?: number) => void;
        getResponse: (id?: number) => string;
      };
    return undefined;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetCaptcha = () => {
    const grecaptcha = getGrecaptcha();
    if (!grecaptcha) return;
    if (widgetIdRef.current !== null) {
      grecaptcha.reset(widgetIdRef.current);
    } else {
      grecaptcha.reset();
    }
    setCaptchaToken(null);
  };

  const tryRenderCaptcha = () => {
    const grecaptcha = getGrecaptcha();
    if (!grecaptcha || !recaptchaContainerRef.current || !siteKey) return false;
    try {
      if (widgetIdRef.current !== null) return true;
      const id = grecaptcha.render(recaptchaContainerRef.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
      });
      widgetIdRef.current = id;
      setCaptchaReady(true);
      setStatus((prev) =>
        prev.type === "error" && prev.message?.includes("Captcha failed") ? { type: "idle" } : prev
      );
      return true;
    } catch (err) {
      console.error("reCAPTCHA render error", err);
      setStatus({ type: "error", message: "Captcha failed to load. Please reload and try again." });
      return false;
    }
  };

  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;
    if (!scriptLoaded) return;

    if (tryRenderCaptcha()) return;

    const interval = setInterval(() => {
      if (tryRenderCaptcha()) {
        clearInterval(interval);
      }
    }, 600);

    const timeout = setTimeout(() => {
      if (!captchaReady) {
        setStatus({
          type: "error",
          message: "Captcha failed to load. Please reload and try again.",
        });
      }
    }, 8000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // tryRenderCaptcha intentionally not added to deps to avoid re-creating intervals each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaReady, scriptLoaded, siteKey]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!siteKey) {
      setStatus({ type: "error", message: "Captcha is not configured. Please try again later." });
      return;
    }

    const grecaptcha = getGrecaptcha();
    const token =
      captchaToken ||
      (widgetIdRef.current !== null
        ? grecaptcha?.getResponse(widgetIdRef.current)
        : grecaptcha?.getResponse());
    if (!token) {
      setStatus({ type: "error", message: "Please confirm you are not a robot." });
      return;
    }

    setSubmitting(true);
    setStatus({ type: "idle" });

    try {
      // Get CSRF token from cookie (__Host-csrf in production, __csrf in dev)
      const csrfCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
      const csrfToken = csrfCookie?.substring(csrfCookie.indexOf("=") + 1) || "";

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ ...form, captcha: token }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus({
          type: "error",
          message: data.error || "Unable to send right now. Please try again.",
        });
        setSubmitting(false);
        return;
      }

      setStatus({
        type: "success",
        message: "Thanks! We received your message and will be in touch soon.",
      });
      setForm({ firstName: "", lastName: "", phone: "", email: "", message: "" });
      resetCaptcha();
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="overflow-hidden bg-white px-4 py-16 md:px-6 md:py-24">
      <div className="content-shell mx-auto max-w-[1100px]">
        <div className="reveal-on-scroll">
          {/* Header card with gradient background */}
          <div className="relative rounded-t-[24px] border border-b-0 border-black/[0.08] bg-[#f5f6f8] p-8 md:rounded-t-[32px] md:p-16">
            <div
              className="pointer-events-none absolute inset-0 isolate overflow-hidden rounded-t-[24px] md:rounded-t-[32px]"
              style={{ clipPath: "inset(0 round 24px 24px 0 0)" }}
            >
              <div className="absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#9c7dff]/30 blur-[80px] md:-left-64 md:-top-64 md:h-[500px] md:w-[500px] md:blur-[200px]" />
              <div className="absolute -bottom-12 -right-10 h-[120px] w-[120px] rounded-full bg-[#fe6839]/30 blur-[80px] md:-bottom-52 md:-right-40 md:h-[300px] md:w-[300px] md:blur-[200px]" />
            </div>
            <div className="relative">
              <h2 className="font-serif text-4xl font-semibold leading-[1] tracking-[-0.025em] text-[#161021] md:text-[60px] md:leading-[60px]">
                Contact Our
                <br />
                <span className="text-[#fe6839]">Team</span>
              </h2>
            </div>
          </div>

          {/* Form card */}
          <div className="rounded-b-[24px] border border-black/[0.08] bg-white p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),0_4px_6px_-4px_rgba(0,0,0,0.08)] md:rounded-b-[32px] md:p-12">
            <Script
              src="https://www.google.com/recaptcha/api.js?render=explicit"
              strategy="afterInteractive"
              id="recaptcha-script"
              nonce={nonce}
              onLoad={() => setScriptLoaded(true)}
              onError={() =>
                setStatus({
                  type: "error",
                  message: "Captcha failed to load. Please reload and try again.",
                })
              }
            />
            {status.type === "success" ? (
              <div
                className="flex w-full animate-fade-in-up flex-col items-center py-12"
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
                  <div className="absolute inset-[2px] rounded-full bg-white" aria-hidden="true" />
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
                <h3 className="font-serif text-2xl text-[#161021]">Message Sent!</h3>
                <p className="mt-2 text-sm text-[#6b6678]">We&apos;ll be in touch soon</p>
                <button
                  type="button"
                  className="mt-6 rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-gray-800 focus-visible-ring"
                  onClick={() => setStatus({ type: "idle" })}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form className="w-full space-y-6 md:space-y-8" onSubmit={handleSubmit}>
                {/* 2-column grid for form fields on desktop */}
                <div className="grid gap-6 md:grid-cols-2 md:gap-x-12 md:gap-y-8">
                  <FormField
                    label="First name*"
                    id="firstName"
                    type="text"
                    value={form.firstName}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                  <FormField
                    label="Phone*"
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                  <FormField
                    label="Last Name*"
                    id="lastName"
                    type="text"
                    value={form.lastName}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                  <FormField
                    label="Email*"
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Message and bottom row in 2-column layout on desktop */}
                <div className="flex w-full flex-col items-center gap-6 md:grid md:grid-cols-2 md:items-end md:gap-x-12">
                  <div className="flex w-full max-w-[400px] flex-col gap-2 md:max-w-none">
                    <label htmlFor="message" className="text-sm font-medium text-[#6b6678]">
                      How can we help you?*
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={4}
                      className="w-full rounded-xl border border-black/[0.14] bg-white px-4 py-4 text-sm font-light text-[#161021] placeholder:text-[#9a96a6] focus:border-[#161021] focus:outline-none disabled:opacity-60"
                      placeholder="Tell us a bit about yourself and your project goals"
                      value={form.message}
                      onChange={handleChange}
                      maxLength={1000}
                      required
                      disabled={submitting}
                      aria-describedby="message-count"
                    />
                    <div id="message-count" className="text-right text-xs text-[#6b6678]">
                      {1000 - form.message.length} characters remaining
                    </div>
                  </div>

                  <div className="flex w-full max-w-[400px] flex-col items-center gap-4 md:max-w-none md:flex-row md:items-center md:justify-start md:gap-6">
                    <div className="flex justify-center md:justify-start">
                      <div
                        ref={recaptchaContainerRef}
                        className="g-recaptcha min-h-[78px]"
                        style={{ transform: "scale(0.85)", transformOrigin: "center top" }}
                        data-theme="light"
                        data-sitekey={siteKey}
                      />
                      {!captchaReady && (
                        <div className="mt-2 text-xs font-medium text-[#6b6678]">
                          Captcha loading... If it does not appear, disable blockers and reload.
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-[2px] hover:bg-gray-800 focus-visible-ring disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex md:w-fit md:px-8"
                      disabled={submitting}
                    >
                      {submitting ? "Sending..." : "Submit"}
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
                    </button>
                  </div>
                </div>

                {status.type === "error" && (
                  <div className="text-sm font-medium text-red-600" role="alert">
                    {status.message}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
