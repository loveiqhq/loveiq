"use client";

import { useState, useEffect, useRef, useCallback, type FC } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import { trackSurveyInvite } from "@/lib/analytics";

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const SHARE_TEXT =
  "I took the LoveIQ assessment \u2014 it gave me real clarity on my relationship patterns. Try it yourself!";

/* ------------------------------------------------------------------ */
/*  Share URL builder                                                  */
/* ------------------------------------------------------------------ */
function buildShareUrl(referrerEmail: string, medium: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org";
  const refId = referrerEmail ? btoa(referrerEmail.toLowerCase().trim()) : "";
  const params = new URLSearchParams({
    utm_source: "referral",
    utm_medium: medium,
    utm_campaign: "survey_invite",
    ...(refId ? { utm_content: refId } : {}),
  });
  return `${siteUrl}/survey?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Tracking helper (fire-and-forget)                                  */
/* ------------------------------------------------------------------ */
function trackShare(method: string, referrerEmail: string) {
  trackSurveyInvite(method);
  fetch("/api/invite-tracking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCsrfToken(),
    },
    body: JSON.stringify({ method, referrerEmail: referrerEmail || undefined }),
  }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
const EnvelopeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="4" width="16" height="12" rx="2" />
    <path d="m2 6 8 5 8-5" />
  </svg>
);

const PeopleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
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
);

const CloseIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

const ArrowIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.167 10h11.666" />
    <path d="m10 4.167 5.833 5.833-5.833 5.833" />
  </svg>
);

const LinkIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const WhatsAppIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const XIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
  </svg>
);

const FacebookIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const EllipsisIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const MessageIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15.75 8.625a6.17 6.17 0 0 1-.663 2.813 6.375 6.375 0 0 1-5.712 3.562 6.17 6.17 0 0 1-2.813-.663L2.25 15.75l1.413-4.313A6.17 6.17 0 0 1 3 8.625a6.375 6.375 0 0 1 3.563-5.712A6.17 6.17 0 0 1 9.375 2.25h.375A6.35 6.35 0 0 1 15.75 8.25v.375z" />
  </svg>
);

const TelegramIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
  </svg>
);

const MailClientIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="1.5" y="3.75" width="15" height="10.5" rx="1.5" />
    <path d="m1.5 5.25 7.5 4.5 7.5-4.5" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  MoreDropdown                                                       */
/* ------------------------------------------------------------------ */
interface MoreDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  referrerEmail: string;
}

const MoreDropdown: FC<MoreDropdownProps> = ({ isOpen, onClose, referrerEmail }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = [
    {
      label: "SMS",
      icon: <MessageIcon className="h-[18px] w-[18px]" />,
      method: "sms" as const,
      action: () => {
        const url = buildShareUrl(referrerEmail, "sms");
        window.open(`sms:?body=${encodeURIComponent(SHARE_TEXT + " " + url)}`, "_self");
      },
    },
    {
      label: "Telegram",
      icon: <TelegramIcon className="h-[18px] w-[18px]" />,
      method: "telegram" as const,
      action: () => {
        const url = buildShareUrl(referrerEmail, "telegram");
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(SHARE_TEXT)}`,
          "_blank",
          "noopener,noreferrer"
        );
      },
    },
    {
      label: "Email",
      icon: <MailClientIcon className="h-[18px] w-[18px]" />,
      method: "email_client" as const,
      action: () => {
        const url = buildShareUrl(referrerEmail, "email_client");
        window.open(
          `mailto:?subject=${encodeURIComponent("Check out LoveIQ")}&body=${encodeURIComponent(SHARE_TEXT + "\n\n" + url)}`,
          "_self"
        );
      },
    },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-1/2 translate-x-1/2 sm:right-0 sm:translate-x-0 mb-2 w-[192px] overflow-hidden rounded-2xl border border-white/10 bg-[#130b1c] shadow-[0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-[12px]"
      style={{
        animation: `survey-fade-up 200ms ${EASING} both`,
      }}
    >
      <div className="flex flex-col gap-0.5 p-1.5">
        {items.map((item) => (
          <button
            key={item.method}
            type="button"
            onClick={() => {
              trackShare(item.method, referrerEmail);
              item.action();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-[14px] text-[#d1d5db] transition hover:bg-white/5"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  SocialButtons                                                      */
/* ------------------------------------------------------------------ */
interface SocialButtonsProps {
  referrerEmail: string;
}

const SocialButtons: FC<SocialButtonsProps> = ({ referrerEmail }) => {
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = buildShareUrl(referrerEmail, "copy_link");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackShare("copy_link", referrerEmail);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable — silently fail */
    }
  }, [referrerEmail]);

  const handleWhatsApp = useCallback(() => {
    const url = buildShareUrl(referrerEmail, "whatsapp");
    trackShare("whatsapp", referrerEmail);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + " " + url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail]);

  const handleTwitter = useCallback(() => {
    const url = buildShareUrl(referrerEmail, "twitter");
    trackShare("twitter", referrerEmail);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail]);

  const handleFacebook = useCallback(() => {
    const url = buildShareUrl(referrerEmail, "facebook");
    trackShare("facebook", referrerEmail);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail]);

  const btnBase =
    "relative flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95";

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      {/* Copy Link */}
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className={`${btnBase} border border-white/10 bg-[#130b1c] shadow-[0_1px_2px_rgba(0,0,0,0.05)]`}
          aria-label="Copy link"
        >
          <LinkIcon className="h-5 w-5 sm:h-6 sm:w-6 text-[#d1d5db]" />
        </button>
        {copied && (
          <span
            className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white/10 px-2.5 py-1 font-sans text-[12px] text-white backdrop-blur-sm"
            style={{ animation: `survey-fade-up 200ms ${EASING} both` }}
          >
            Copied!
          </span>
        )}
      </div>

      {/* WhatsApp */}
      <button
        type="button"
        onClick={handleWhatsApp}
        className={`${btnBase} bg-[#25d366] shadow-[0_0_15px_rgba(37,211,102,0.3)]`}
        aria-label="Share on WhatsApp"
      >
        <WhatsAppIcon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
      </button>

      {/* Twitter / X */}
      <button
        type="button"
        onClick={handleTwitter}
        className={`${btnBase} bg-black border border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]`}
        aria-label="Share on X"
      >
        <XIcon className="h-[14px] w-[14px] sm:h-4 sm:w-4 text-white" />
      </button>

      {/* Facebook */}
      <button
        type="button"
        onClick={handleFacebook}
        className={`${btnBase} bg-[#1877f2] shadow-[0_0_15px_rgba(24,119,242,0.3)]`}
        aria-label="Share on Facebook"
      >
        <FacebookIcon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
      </button>

      {/* More */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`${btnBase} border border-white/10 bg-[#130b1c] shadow-[0_1px_2px_rgba(0,0,0,0.05)]`}
          aria-label="More sharing options"
          aria-expanded={moreOpen}
        >
          <EllipsisIcon className="h-5 w-5 sm:h-6 sm:w-6 text-[#d1d5db]" />
        </button>
        <MoreDropdown
          isOpen={moreOpen}
          onClose={() => setMoreOpen(false)}
          referrerEmail={referrerEmail}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  InviteModal                                                        */
/* ------------------------------------------------------------------ */
type ModalState = "idle" | "sending" | "success" | "error";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  referrerEmail: string;
  referrerName: string;
}

const InviteModal: FC<InviteModalProps> = ({ open, onClose, referrerEmail, referrerName }) => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset modal state on open/close — intentional cascading render
  // to trigger entering CSS transition on open.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setState("idle");
      setEmail("");
      setErrorMsg("");
      requestAnimationFrame(() => setIsVisible(true));
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setIsVisible(false);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "sending") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, state]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }

      setState("sending");
      setErrorMsg("");
      trackSurveyInvite("email");

      try {
        const res = await fetch("/api/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            recipientEmail: trimmed,
            referrerEmail: referrerEmail.trim().toLowerCase() || undefined,
            referrerName: referrerName.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error || "Something went wrong. Please try again.");
          setState("error");
          return;
        }

        setState("success");
      } catch {
        setErrorMsg("Unable to send. Please check your connection.");
        setState("error");
      }
    },
    [email, referrerEmail, referrerName]
  );

  if (!open) return null;

  const isSuccess = state === "success";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-[rgba(217,217,217,0.1)] backdrop-blur-[3.75px]"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: `opacity 300ms ${EASING}`,
        }}
        aria-hidden="true"
        onClick={state !== "sending" ? onClose : undefined}
      />

      {/* Dialog container — bottom-sheet on mobile, centered on desktop */}
      <div className="fixed inset-0 z-50 flex items-end justify-center px-4 sm:items-center sm:px-5 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isSuccess ? "Invite sent" : "Invite a friend"}
          className={`pointer-events-auto w-full overflow-hidden rounded-t-3xl border border-white/10 sm:rounded-3xl ${
            isSuccess ? "sm:max-w-[460px]" : "sm:max-w-[448px]"
          }`}
          style={{
            background: "#130b1c",
            boxShadow: isSuccess
              ? "0 25px 50px -12px rgba(0,0,0,0.25)"
              : "0 0 50px rgba(168,85,247,0.1)",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(24px)",
            transition: `all 400ms ${EASING}`,
          }}
        >
          <div
            className="relative"
            style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              disabled={state === "sending"}
              className="absolute right-5 top-5 z-10 flex items-center justify-center rounded-full bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white/60 disabled:opacity-30"
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            {isSuccess ? (
              /* ---- Success State ---- */
              <div className="flex flex-col items-center px-6 py-10 sm:px-[33px] sm:py-[49px]">
                {/* Icon */}
                <div
                  className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.1)]"
                  style={{ animation: `survey-scale-in 500ms ${EASING} both` }}
                >
                  <CheckIcon className="h-8 w-8 text-[#fe6839]" />
                </div>

                {/* Heading */}
                <h2
                  className="mt-6 font-serif text-[24px] sm:text-[30px] font-medium tracking-[-0.75px] text-white"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 200ms both` }}
                >
                  Invite sent!
                </h2>

                {/* Body */}
                <div
                  className="mt-4 text-center"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 350ms both` }}
                >
                  <p className="font-sans text-[15px] sm:text-[18px] text-[#8e859b]">
                    We&rsquo;ve sent a beautifully designed email to
                  </p>
                  <p className="mt-1 truncate font-sans text-[15px] sm:text-[18px] font-medium text-[#a773f5]">
                    {email.trim()}
                  </p>
                </div>
              </div>
            ) : (
              /* ---- Form State ---- */
              <div className="px-6 pb-6 pt-6 sm:px-6">
                {/* Header */}
                <div className="flex items-center gap-4 pr-10">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.1)]">
                    <PeopleIcon className="h-6 w-6 text-[#fe6839]" />
                  </div>
                  <h2 className="font-serif text-[20px] sm:text-[24px] font-normal tracking-[-0.6px] text-white">
                    Invite a friend
                  </h2>
                </div>

                {/* Description */}
                <p className="mt-4 font-sans text-[16px] font-light leading-[26px] text-[#9ca3af]">
                  Share LoveIQ with someone you care about. We&rsquo;ll send them a beautifully
                  designed email with a link to try the assessment.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-6">
                  {/* Email input */}
                  <div className="relative">
                    <EnvelopeIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7280]" />
                    <input
                      ref={inputRef}
                      type="email"
                      placeholder="Enter their email address"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      disabled={state === "sending"}
                      className="w-full rounded-2xl border border-white/10 bg-[#130b1c] py-[18px] pl-[49px] pr-4 font-sans text-[16px] text-white placeholder-[#6b7280] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] outline-none transition focus:border-[#fe6839]/40 focus:ring-1 focus:ring-[#fe6839]/20 disabled:opacity-50"
                    />
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <p className="mt-2.5 font-sans text-[13px] text-[#f87171]">{errorMsg}</p>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={state === "sending"}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#fe6839] px-6 py-4 font-sans text-[16px] font-semibold text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_20px_-3px_rgba(254,104,57,0.25)] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                  >
                    {state === "sending" ? (
                      "Sending..."
                    ) : (
                      <>
                        Send Invite
                        <ArrowIcon className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="mt-6 border-t border-white/5 pt-[25px]">
                  <SocialButtons referrerEmail={referrerEmail} />
                </div>

                {/* Cancel link */}
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={state === "sending"}
                    className="font-sans text-[16px] font-light text-[#6b7280] transition hover:text-white/50 disabled:opacity-30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default InviteModal;
