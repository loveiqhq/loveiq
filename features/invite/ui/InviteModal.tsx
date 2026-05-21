"use client";

import { useState, useEffect, useRef, useCallback, type FC } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";
import { trackSurveyInvite } from "@features/analytics/client";
import { SHARE_MESSAGE_BODY, buildShareMessage } from "@shared/url/share-message";

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
type ShareMethod =
  | "copy_link"
  | "email"
  | "email_client"
  | "facebook"
  | "instagram"
  | "sms"
  | "telegram"
  | "twitter"
  | "whatsapp";

/* ------------------------------------------------------------------ */
/*  Share URL builder                                                  */
/* ------------------------------------------------------------------ */
function buildShareUrl(referrerEmail: string, medium: ShareMethod): string {
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
function trackShare(method: ShareMethod, referrerEmail: string) {
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
    <path d="M16 21V19C16 16.7923 14.2077 15 12 15H6C3.79234 15 2 16.7923 2 19V21" />
    <path d="M5 7C5 8.42906 5.7624 9.74957 7 10.4641C8.2376 11.1786 9.7624 11.1786 11 10.4641C12.2376 9.74957 13 8.42906 13 7C13 4.79234 11.2077 3 9 3C6.79234 3 5 4.79234 5 7H5" />
    <path d="M19 8V14" />
    <path d="M22 11H16" />
  </svg>
);

const ReferFriendIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M16 21V19C16 16.7923 14.2077 15 12 15H6C3.79234 15 2 16.7923 2 19V21"
      stroke="#A855F7"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 7C5 8.42906 5.7624 9.74957 7 10.4641C8.2376 11.1786 9.7624 11.1786 11 10.4641C12.2376 9.74957 13 8.42906 13 7C13 4.79234 11.2077 3 9 3C6.79234 3 5 4.79234 5 7H5"
      stroke="#A855F7"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 8V14"
      stroke="#A855F7"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 11H16"
      stroke="#A855F7"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

const MessengerIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8z" />
  </svg>
);

const InstagramIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
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

const CopyIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5V9.5A1.5 1.5 0 0 0 3.5 11H5" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  MoreDropdown                                                       */
/* ------------------------------------------------------------------ */
interface MoreDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  referrerEmail: string;
  onShareClick?: () => void;
}

const MoreDropdown: FC<MoreDropdownProps> = ({ isOpen, onClose, referrerEmail, onShareClick }) => {
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
        window.open(`sms:?body=${encodeURIComponent(buildShareMessage(url))}`, "_self");
      },
    },
    {
      label: "Telegram",
      icon: <TelegramIcon className="h-[18px] w-[18px]" />,
      method: "telegram" as const,
      action: () => {
        const url = buildShareUrl(referrerEmail, "telegram");
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(SHARE_MESSAGE_BODY)}`,
          "_blank",
          "noopener,noreferrer"
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
              onShareClick?.();
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
  onCopied: () => void;
  onEmailClick: () => void;
  emailActive: boolean;
  onShareClick?: () => void;
}

const SocialButtons: FC<SocialButtonsProps> = ({
  referrerEmail,
  onCopied,
  onEmailClick,
  emailActive,
  onShareClick,
}) => {
  const [copiedBtn, setCopiedBtn] = useState<"copy" | "instagram" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const copyUrl = useCallback(
    async (method: "copy_link" | "instagram") => {
      onShareClick?.();
      const url = buildShareUrl(referrerEmail, method);
      try {
        await navigator.clipboard.writeText(url);
        setCopiedBtn(method === "copy_link" ? "copy" : "instagram");
        trackShare(method, referrerEmail);
        onCopied();
        setTimeout(() => setCopiedBtn(null), 2000);
        return true;
      } catch {
        return false;
      }
    },
    [referrerEmail, onCopied, onShareClick]
  );

  const handleWhatsApp = useCallback(() => {
    onShareClick?.();
    const url = buildShareUrl(referrerEmail, "whatsapp");
    trackShare("whatsapp", referrerEmail);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildShareMessage(url))}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail, onShareClick]);

  const handleX = useCallback(() => {
    onShareClick?.();
    const url = buildShareUrl(referrerEmail, "twitter");
    trackShare("twitter", referrerEmail);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_MESSAGE_BODY)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail, onShareClick]);

  // Instagram has no public web-share intent. Pre-copy link so the user can
  // paste in DMs, then on mobile attempt the instagram:// deep link with a
  // web fallback; on desktop open instagram.com directly.
  const handleInstagram = useCallback(async () => {
    await copyUrl("instagram");
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const fallback = window.setTimeout(() => {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      }, 1200);
      const onHide = () => window.clearTimeout(fallback);
      window.addEventListener("pagehide", onHide, { once: true });
      window.location.href = "instagram://app";
    } else {
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
  }, [copyUrl]);

  const handleMessenger = useCallback(() => {
    onShareClick?.();
    const url = buildShareUrl(referrerEmail, "facebook");
    trackShare("facebook", referrerEmail);
    window.open(
      `https://m.me/share?link=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [referrerEmail, onShareClick]);

  const btnBase =
    "relative flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[rgba(168,85,247,0.5)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:scale-105 active:scale-95";
  const btnActiveRing =
    "ring-2 ring-[#fe6839] ring-offset-2 ring-offset-[#130b1c] bg-[rgba(254,104,57,0.6)]";
  const btnCopiedRing =
    "ring-2 ring-[#22c55e] ring-offset-2 ring-offset-[#130b1c] bg-[rgba(34,197,94,0.7)]";

  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-4 md:gap-6">
      {/* Email */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onEmailClick}
          className={`${btnBase} ${emailActive ? btnActiveRing : ""}`}
          aria-label="Send invite by email"
          aria-pressed={emailActive}
        >
          <EnvelopeIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">Email</span>
      </div>

      {/* Copy Link */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => copyUrl("copy_link")}
          className={`${btnBase} ${copiedBtn === "copy" ? btnCopiedRing : ""}`}
          aria-label="Copy link"
        >
          {copiedBtn === "copy" ? (
            <CheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          ) : (
            <LinkIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          )}
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">
          {copiedBtn === "copy" ? "Link Copied" : "Copy Link"}
        </span>
      </div>

      {/* Instagram */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={handleInstagram}
          className={`${btnBase} ${copiedBtn === "instagram" ? btnCopiedRing : ""}`}
          aria-label="Share via Instagram (copies link, then opens Instagram)"
        >
          {copiedBtn === "instagram" ? (
            <CheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          ) : (
            <InstagramIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          )}
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">
          {copiedBtn === "instagram" ? "Link Copied" : "Instagram"}
        </span>
      </div>

      {/* WhatsApp */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={handleWhatsApp}
          className={btnBase}
          aria-label="Share on WhatsApp"
        >
          <WhatsAppIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">
          WhatsApp
        </span>
      </div>

      {/* X */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button type="button" onClick={handleX} className={btnBase} aria-label="Share on X">
          <XIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">X</span>
      </div>

      {/* Messenger */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={handleMessenger}
          className={btnBase}
          aria-label="Share on Messenger"
        >
          <MessengerIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </button>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">
          Messenger
        </span>
      </div>

      {/* More */}
      <div className="flex flex-col items-center gap-2 sm:gap-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={btnBase}
            aria-label="More sharing options"
            aria-expanded={moreOpen}
          >
            <EllipsisIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </button>
          <MoreDropdown
            isOpen={moreOpen}
            onClose={() => setMoreOpen(false)}
            referrerEmail={referrerEmail}
            onShareClick={onShareClick}
          />
        </div>
        <span className="font-sans text-[12px] sm:text-[13px] font-medium text-white">More</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ReferralLinkCard                                                   */
/* ------------------------------------------------------------------ */
interface ReferralLinkCardProps {
  referrerEmail: string;
}

const ReferralLinkCard: FC<ReferralLinkCardProps> = ({ referrerEmail }) => {
  const [copied, setCopied] = useState(false);
  const url = buildShareUrl(referrerEmail, "copy_link");

  const handleCopyAgain = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable */
    }
  }, [url]);

  return (
    <div
      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5"
      style={{ animation: `survey-fade-up 250ms ${EASING} both` }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(168,85,247,0.2)]">
          <LinkIcon className="h-5 w-5 text-[#a855f7]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[13px] font-medium uppercase tracking-[0.65px] text-white/50">
            Your Referral Link
          </p>
          <p className="truncate font-sans text-[13px] text-white/90">{url}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopyAgain}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border py-2.5 font-sans text-[13px] transition ${
          copied
            ? "border-[#22c55e]/40 bg-[rgba(34,197,94,0.15)] text-[#22c55e]"
            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
        }`}
        aria-live="polite"
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        {copied ? "Link Copied" : "Copy Again"}
      </button>
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
  const [senderName, setSenderName] = useState(referrerName);
  const [personalMessage, setPersonalMessage] = useState(SHARE_MESSAGE_BODY);
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [showReferralCard, setShowReferralCard] = useState(false);
  const [methodSelected, setMethodSelected] = useState<"email" | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const showInvalidEmail = emailTouched && trimmedEmail.length > 0 && !isEmailValid;
  const showValidEmail = emailTouched && isEmailValid;
  const hasError = !!errorMsg || showInvalidEmail;

  // Reset on open/close
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setState("idle");
      setEmail("");
      setSenderName(referrerName);
      setPersonalMessage(SHARE_MESSAGE_BODY);
      setErrorMsg("");
      setShowReferralCard(false);
      setMethodSelected(null);
      setEmailTouched(false);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open, referrerName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus email input when the email form expands
  useEffect(() => {
    if (methodSelected === "email") {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [methodSelected]);

  const toggleEmailForm = useCallback(() => {
    setMethodSelected((cur) => (cur === "email" ? null : "email"));
  }, []);

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
      setEmailTouched(true);
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setErrorMsg("Please enter a valid email address.");
        inputRef.current?.focus();
        return;
      }

      setState("sending");
      setErrorMsg("");
      trackSurveyInvite("email");

      try {
        const trimmedMessage = personalMessage.trim();
        const res = await fetch("/api/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            recipientEmail: trimmed,
            referrerEmail: referrerEmail.trim().toLowerCase() || undefined,
            referrerName: senderName.trim() || undefined,
            personalMessage: trimmedMessage || undefined,
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
    [email, referrerEmail, senderName, personalMessage]
  );

  const handleSendAnother = useCallback(() => {
    setState("idle");
    setEmail("");
    setPersonalMessage(SHARE_MESSAGE_BODY);
    setErrorMsg("");
    setShowReferralCard(false);
    setEmailTouched(false);
    setMethodSelected("email");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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
          pointerEvents: isVisible ? undefined : "none",
        }}
        aria-hidden="true"
        onClick={state !== "sending" ? onClose : undefined}
      />

      {/* Dialog container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4 sm:px-5 sm:py-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isSuccess ? "Referral sent" : "Refer a friend"}
          data-testid="invite-modal"
          className={`pointer-events-auto relative flex w-full max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-white/10 ${
            isSuccess ? "sm:max-w-[744px]" : "sm:max-w-[789px]"
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
          {/* Close button — anchored to dialog, stays visible while content scrolls */}
          <button
            type="button"
            onClick={onClose}
            disabled={state === "sending"}
            className="absolute right-4 top-4 sm:right-5 sm:top-5 z-20 flex items-center justify-center rounded-full bg-white/5 p-2.5 sm:p-2 text-white/40 transition hover:bg-white/10 hover:text-white/60 disabled:opacity-30"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          <div
            data-lenis-prevent
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
          >
            {isSuccess ? (
              /* ---- Success State ---- */
              <div className="flex flex-col items-center px-8 py-12 sm:px-[33px] sm:py-[49px] gap-8">
                {/* Purple check icon */}
                <div
                  className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.1)]"
                  style={{ animation: `survey-scale-in 500ms ${EASING} both` }}
                >
                  <CheckIcon className="h-8 w-8 text-[#a855f7]" />
                </div>

                {/* Heading */}
                <h2
                  className="font-serif text-[36px] sm:text-[49px] font-medium tracking-[-1.2px] text-white text-center"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 200ms both` }}
                >
                  Referral Sent!
                </h2>

                {/* Body */}
                <p
                  className="text-center font-sans text-[16px] sm:text-[20px] font-light leading-[1.55] text-white/70 max-w-[526px]"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 350ms both` }}
                >
                  Your friend will receive a personalized email invitation with your unique referral
                  link at: <span className="font-normal text-white">{email.trim()}</span>.
                </p>

                {/* What happens next card */}
                <div
                  className="w-full max-w-[512px] rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 450ms both` }}
                >
                  <p className="font-sans text-[13px] font-semibold uppercase tracking-[1.3px] text-[#a855f7] mb-3">
                    What happens next?
                  </p>
                  <div className="flex flex-col gap-3">
                    {[
                      "Your friend receives the invitation email",
                      "They click your unique referral link",
                      "They start their own journey of self-discovery through their assessment",
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(168,85,247,0.2)]">
                          <span className="font-sans text-[13px] font-bold text-[#a855f7]">
                            {i + 1}
                          </span>
                        </div>
                        <p className="font-sans text-[13px] font-light text-white/70">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex w-full flex-col gap-4"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 550ms both` }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#fe6839] py-4 font-sans text-[16px] font-medium text-white transition hover:-translate-y-0.5"
                  >
                    Back to Report
                    <ArrowIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSendAnother}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-4 font-sans text-[16px] font-medium text-white/70 shadow-[0_10px_15px_0_rgba(0,0,0,0.2),0_4px_6px_0_rgba(0,0,0,0.2)] transition hover:bg-white/15"
                  >
                    Send Another Invitation
                    <PeopleIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ) : (
              /* ---- Form State ---- */
              <div className="flex flex-col gap-6 sm:gap-10 px-5 sm:px-[22px] pt-5 sm:pt-6 pb-24 sm:pb-8">
                {/* Header */}
                <div className="flex items-center justify-between pr-10">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.1)]">
                      <ReferFriendIcon className="h-6 w-6 text-[#a855f7]" />
                    </div>
                    <h2 className="font-serif text-[24px] font-normal tracking-[-0.6px] text-white">
                      Refer a friend
                    </h2>
                  </div>
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <p className="font-sans text-[15px] sm:text-[16px] font-light leading-[22px] sm:leading-[26px] text-[#9ca3af]">
                    You&rsquo;ve just uncovered your LoveIQ. Now invite someone else to discover
                    theirs.
                  </p>
                  <p className="font-sans text-[15px] sm:text-[16px] font-light leading-[22px] sm:leading-[26px] text-[#9ca3af]">
                    Share LoveIQ with someone you care about. Pick how you&rsquo;d like to share —
                    select Email below to send a personalized invitation.
                  </p>
                </div>

                {/* Share method row */}
                <SocialButtons
                  referrerEmail={referrerEmail}
                  onCopied={() => setShowReferralCard(true)}
                  onEmailClick={toggleEmailForm}
                  emailActive={methodSelected === "email"}
                  onShareClick={() => setMethodSelected(null)}
                />

                {/* Email form — expands when methodSelected === "email" */}
                <div
                  id="invite-email-form"
                  aria-hidden={methodSelected !== "email"}
                  className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    methodSelected === "email"
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0">
                    <form
                      onSubmit={handleSubmit}
                      noValidate
                      className="flex flex-col gap-6 border-t border-white/5 pt-8"
                    >
                      {/* Name used in mail */}
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="invite-sender-name"
                          className="px-2 font-sans text-[16px] text-white"
                        >
                          Name used in mail
                        </label>
                        <input
                          id="invite-sender-name"
                          type="text"
                          placeholder="Your name"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          disabled={state === "sending"}
                          className="w-full rounded-2xl border border-white/10 bg-[#130b1c] py-[19px] px-[25px] font-sans text-[16px] text-white placeholder-[#6b7280] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] outline-none transition focus:border-[#a855f7]/60 disabled:opacity-50"
                        />
                      </div>

                      {/* Friend's Email */}
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="invite-recipient-email"
                          className="px-2 font-sans text-[16px] text-white"
                        >
                          Friend&rsquo;s Email
                        </label>
                        <div className="relative">
                          <EnvelopeIcon
                            className={`pointer-events-none absolute left-[20px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition ${
                              hasError
                                ? "text-[#ef4444]"
                                : showValidEmail
                                  ? "text-[#22c55e]"
                                  : "text-[#7a738d]"
                            }`}
                          />
                          <input
                            ref={inputRef}
                            id="invite-recipient-email"
                            type="email"
                            placeholder="mb@loveiq.org"
                            value={email}
                            aria-invalid={showInvalidEmail || !!errorMsg}
                            aria-describedby={hasError ? "invite-email-error" : undefined}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (errorMsg) setErrorMsg("");
                              if (state === "error") setState("idle");
                            }}
                            onBlur={() => setEmailTouched(true)}
                            disabled={state === "sending"}
                            className={`w-full rounded-2xl border bg-[#130b1c] py-[19px] pl-[52px] pr-[44px] font-sans text-[16px] text-white placeholder:text-[#7a738d] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] outline-none transition disabled:opacity-50 ${
                              hasError
                                ? "border-[#ef4444] focus:border-[#ef4444]"
                                : showValidEmail
                                  ? "border-[#22c55e]/60 focus:border-[#22c55e]"
                                  : "border-white/[0.09] focus:border-[#a855f7]/60"
                            }`}
                          />
                          {showValidEmail && !errorMsg && (
                            <CheckIcon
                              className="pointer-events-none absolute right-[20px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#22c55e]"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        {hasError && (
                          <p
                            id="invite-email-error"
                            role="alert"
                            className="px-2 font-sans text-[14px] text-[#ef4444]"
                          >
                            {errorMsg || "Please enter a valid email address."}
                          </p>
                        )}
                      </div>

                      {/* Personal message */}
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="invite-message"
                          className="px-2 font-sans text-[16px] text-white"
                        >
                          Personal message{" "}
                          <span className="text-[14px] font-light text-white/50">(optional)</span>
                        </label>
                        <textarea
                          id="invite-message"
                          rows={5}
                          placeholder="Write your own note (optional)"
                          value={personalMessage}
                          onChange={(e) => setPersonalMessage(e.target.value.slice(0, 1500))}
                          disabled={state === "sending"}
                          maxLength={1500}
                          className="w-full resize-y max-h-[40dvh] sm:max-h-none rounded-2xl border border-white/10 bg-[#130b1c] py-[15px] px-[25px] font-sans text-[15px] sm:text-[16px] leading-[22px] sm:leading-[24px] text-white placeholder-[#6b7280] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] outline-none transition focus:border-[#a855f7]/60 disabled:opacity-50"
                        />
                      </div>

                      {/* Submit button — sticky on mobile so it's always reachable */}
                      <div className="sticky bottom-0 -mx-5 sm:mx-0 bg-gradient-to-t from-[#130b1c] via-[#130b1c] to-transparent px-5 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:static sm:bg-none sm:p-0">
                        <button
                          type="submit"
                          disabled={state === "sending"}
                          className="flex w-full items-center justify-center gap-2 rounded-full py-4 font-sans text-[16px] font-semibold text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 disabled:opacity-70"
                          style={{
                            backgroundColor:
                              isEmailValid && state !== "sending" ? "#fe6839" : "#6f6f6f",
                          }}
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
                      </div>
                    </form>
                  </div>
                </div>

                {/* Referral link card — shown after copy action */}
                {showReferralCard && <ReferralLinkCard referrerEmail={referrerEmail} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default InviteModal;
