"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type MouseEvent,
} from "react";
import { trackPaygateExitLeave, trackPaygateExitViewed } from "@features/analytics/client";
import {
  getTrustpilotConfig,
  isTrustpilotEnabled,
  TRUSTPILOT_FALLBACK_URL,
} from "@shared/ui/trustpilot/config";
import { PAYMENT_MARKS } from "../../paymentMarks";
import { euros } from "../gateContent";
import ExitReasons from "./ExitReasons";
import {
  EXIT_COPY,
  trustpilotLabel,
  type ExitStage,
  type InitialUnlockSource,
} from "./exitContent";
import {
  ArrowRightIcon,
  BubbleIcon,
  ChevronLeftIcon,
  OfferTickIcon,
  PulseIcon,
  RingsIcon,
  ShieldIcon,
  TickIcon,
} from "./exitIcons";
import "./paygate-exit.css";

export type ExitCtaPlace = "card" | "sticky";

export interface PaygateExitOffer {
  /** What the button charges: the EUR 1.99, or the full report after the credit. */
  priceCents: number;
  /** The full report before the credit, struck through; none on the gate's page. */
  strikeCents?: number | null;
}

export interface PaygateExitPageProps {
  stage: ExitStage;
  offer: PaygateExitOffer;
  /** The EUR 10 the EUR 1.99 brings toward the full report. */
  creditCents: number;
  guaranteeDays: number;
  /** FullUnlock only: what the EUR 1.99 cost, for "You earned it with your €1.99 unlock". */
  initialPriceCents?: number;
  /** FullUnlock only: a gift reader (E07) never paid the EUR 1.99, so is told so. */
  unlockSource?: InitialUnlockSource | null;
  /**
   * The reader's submission, or "preview": it seeds the reasons' order. Neither page binds it
   * to the events: the gate stays mounted under its exit page and keeps it bound, and the full
   * report's layer sits over the report, which binds it.
   */
  seed: string;
  checkout: { busy: boolean; error: string | null; errorPlace: ExitCtaPlace | null };
  onUnlock: (place: ExitCtaPlace) => void;
  onBack: () => void;
  /** The quiet way out at the foot: "Maybe later" (a link, `leaveHref`) or "Back to my open chapters". */
  onLeave: () => void;
  leaveHref?: string;
  /** Tests pin the reasons' order outright. */
  random?: () => number;
}

const WHY_ICONS = [PulseIcon, BubbleIcon, RingsIcon];

/** What holds the focus now, unless nothing does. */
function focusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/** Trustpilot, only with the site's switch on and both numbers configured, never typed in. */
const ExitTrustpilot: FC = () => {
  if (!isTrustpilotEnabled()) return null;
  const config = getTrustpilotConfig();
  if (!config.score || !config.reviewCount) return null;
  const score = Number.parseFloat(config.score);
  if (!Number.isFinite(score)) return null;
  const label = trustpilotLabel(score);
  return (
    <a
      className="pge-tp"
      href={config.profileUrl ?? TRUSTPILOT_FALLBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={EXIT_COPY.trustpilot.aria(label, config.score, config.reviewCount)}
    >
      <span className="pge-tp__stars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, score - i));
          const part = fill > 0 && fill < 1;
          return (
            <span
              key={i}
              className={
                part
                  ? "pge-tp__star pge-tp__star--part"
                  : fill === 0
                    ? "pge-tp__star pge-tp__star--empty"
                    : "pge-tp__star"
              }
              style={
                part
                  ? ({ "--pge-tp-fill": `${Math.round(fill * 100)}%` } as CSSProperties)
                  : undefined
              }
            >
              ★
            </span>
          );
        })}
      </span>
      <span className="pge-tp__text">
        <span>
          <strong>{label}</strong> {EXIT_COPY.trustpilot.outOf(config.score)}
        </span>
        <span className="pge-tp__muted">
          {EXIT_COPY.trustpilot.reviews(config.reviewCount)}{" "}
          <strong>{EXIT_COPY.trustpilot.brand}</strong>
        </span>
      </span>
    </a>
  );
};

/**
 * Marcus's "Paygate exit pages" (28.10): Main (`pre`), where the EUR 1.99 gate's "Not ready to
 * unlock yet" leads, and FullUnlock (`full`), where the plan picker's leads for a EUR 1.99
 * holder. Both make the case (the guarantee first), ask why ("Not today?"), and offer the same
 * unlock again, with a quiet way out at the foot and the bar on the page's foot.
 */
const PaygateExitPage: FC<PaygateExitPageProps> = ({
  stage,
  offer,
  creditCents,
  guaranteeDays,
  initialPriceCents = 199,
  unlockSource = null,
  seed,
  checkout,
  onUnlock,
  onBack,
  onLeave,
  leaveHref,
  random,
}) => {
  const offerTitleId = useId();
  const full = stage === "full";

  // The page takes the focus as it opens, at its own top: the link that opened it went with the
  // gate (pre) or sits under the layer (full). A container, so no ring; Tab finds the arrow.
  // Closing gives it back to what held it (the gate's link, or the chapter that opened the
  // plans), as the plan picker does.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [opener] = useState(focusedElement);
  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackPaygateExitViewed({ stage });
  }, [stage]);

  // The press is recorded where its checkout starts: the gate's, as `initial_gate_cta_click`
  // from the exit page (pre), and FullReportExit's own (full).
  const unlock = (place: ExitCtaPlace) => {
    if (checkout.busy) return;
    onUnlock(place);
  };
  const back = () => {
    trackPaygateExitLeave({ stage, via: "back" });
    onBack();
  };
  const leave = () => {
    trackPaygateExitLeave({ stage, via: full ? "chapters" : "maybe_later" });
    onLeave();
  };
  // As the gate's own way out: a plain left click counts; a new tab or window does not leave.
  const leaveByLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    leave();
  };

  const features = full
    ? EXIT_COPY.offer.full.features(
        creditCents,
        unlockSource === "gift" ? "gift" : "paid",
        initialPriceCents
      )
    : EXIT_COPY.offer.pre.features(creditCents);

  return (
    <div className="pge-shell">
      {/* pre stands in for the gate's <main>; full sits in its dialog over the report's own. */}
      <div
        ref={pageRef}
        className="pge-page"
        data-stage={stage}
        role={full ? undefined : "main"}
        tabIndex={-1}
      >
        <header className="pge-header">
          <button
            type="button"
            className="pge-header__back"
            aria-label={EXIT_COPY.back[stage]}
            onClick={back}
          >
            <ChevronLeftIcon />
          </button>
          <span className="pge-brand">
            {EXIT_COPY.brand.lead}
            <span className="pge-brand__iq">{EXIT_COPY.brand.emph}</span>
          </span>
          <span className="pge-header__spacer" aria-hidden="true" />
        </header>

        <section className="pge-hero">
          {/* "is" stays with the emphasis, as in the canvas: "Unlocking / is fully risk-free". */}
          <h1 className="pge-hero__title">
            {EXIT_COPY.hero.lead}
            {"\u00a0"}
            <span className="pge-hero__emph">{EXIT_COPY.hero.emph}</span>
          </h1>
        </section>

        <div className="pge-safe-wrap">
          <div className="pge-safe">
            <div className="pge-safe__top">
              <div className="pge-safe__icon" aria-hidden="true">
                <span className="pge-safe__ring" />
                <span className="pge-safe__disc">
                  <ShieldIcon />
                </span>
              </div>
              <div className="pge-safe__heading">
                <h2 className="pge-safe__title">{EXIT_COPY.guarantee.title(guaranteeDays)}</h2>
                <span className="pge-safe__sub">{EXIT_COPY.guarantee.subtitle}</span>
              </div>
            </div>
            <p className="pge-safe__text">
              {EXIT_COPY.guarantee.body(guaranteeDays)}{" "}
              <strong>{EXIT_COPY.guarantee.bodyStrong}</strong>
            </p>
            <p className="pge-safe__text">{EXIT_COPY.guarantee.care}</p>
            <ul className="pge-safe__chips">
              {EXIT_COPY.guarantee.chips.map((chip) => (
                <li key={chip} className="pge-safe__chip">
                  <TickIcon />
                  {chip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {full ? (
          <div className="pge-credit-wrap">
            <div className="pge-credit">
              <span className="pge-credit__tile" aria-hidden="true">
                <span className="pge-credit__amount">{euros(creditCents)}</span>
                <span className="pge-credit__label">{EXIT_COPY.credit.tileLabel}</span>
              </span>
              <div className="pge-credit__text">
                <span className="pge-credit__title">{EXIT_COPY.credit.title(creditCents)}</span>
                <span className="pge-credit__line">
                  {unlockSource === "gift"
                    ? EXIT_COPY.credit.gift
                    : EXIT_COPY.credit.paid(initialPriceCents)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <section className="pge-why" aria-labelledby={`${offerTitleId}-why`}>
          <ExitTrustpilot />
          <h2 id={`${offerTitleId}-why`} className="pge-h2">
            {EXIT_COPY.why.title}
          </h2>
          <ul className="pge-why__rows">
            {EXIT_COPY.why.rows.map((row, i) => {
              const Icon = WHY_ICONS[i] ?? PulseIcon;
              return (
                <li key={row.strong} className="pge-why__row">
                  <span className="pge-why__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="pge-why__text">
                    <strong>{row.strong}</strong> {row.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <ExitReasons
          stage={stage}
          priceCents={full ? initialPriceCents : offer.priceCents}
          seed={seed}
          random={random}
        />

        <section className="pge-offer" aria-labelledby={offerTitleId}>
          <div className="pge-offer__box">
            <span className="pge-offer__pill">{EXIT_COPY.offer.badge}</span>
            <h2 id={offerTitleId} className="pge-offer__title">
              {full ? EXIT_COPY.offer.full.title : EXIT_COPY.offer.pre.title}
            </h2>
            {full ? null : <p className="pge-offer__desc">{EXIT_COPY.offer.pre.description}</p>}
            <div
              className={
                offer.strikeCents ? "pge-offer__price pge-offer__price--struck" : "pge-offer__price"
              }
            >
              <span className="pge-offer__amount">{euros(offer.priceCents)}</span>
              {offer.strikeCents ? (
                <s className="pge-offer__strike">{euros(offer.strikeCents)}</s>
              ) : null}
              <span className="pge-offer__suffix">{EXIT_COPY.offer.priceSuffix}</span>
            </div>
            <button
              type="button"
              className="pge-offer__cta"
              disabled={checkout.busy}
              aria-busy={checkout.busy}
              onClick={() => unlock("card")}
            >
              {full ? EXIT_COPY.offer.full.cta : EXIT_COPY.offer.pre.cta}
              <ArrowRightIcon />
            </button>
            {checkout.error && checkout.errorPlace === "card" ? (
              <p className="pge-offer__error" role="alert">
                {checkout.error}
              </p>
            ) : null}
            <div className="pge-offer__safe">
              <span className="pge-offer__safe-icon" aria-hidden="true">
                <ShieldIcon size={18} width={2} />
              </span>
              <span className="pge-offer__safe-text">
                <span className="pge-offer__safe-title">
                  {EXIT_COPY.offer.guarantee(guaranteeDays)}
                </span>
                <span className="pge-offer__safe-line">{EXIT_COPY.offer.guaranteeLine}</span>
              </span>
            </div>
            <ul className="pge-offer__list">
              {features.map((line) => (
                <li key={`${line.strong ?? ""}${line.text}`} className="pge-offer__item">
                  <OfferTickIcon />
                  <span>
                    {line.strong ? <strong>{line.strong}</strong> : null}
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pge-pay">
            <span className="pge-pay__label">{EXIT_COPY.offer.paymentsLabel}</span>
            <ul className="pge-pay__chips" aria-label="Accepted payment methods">
              {PAYMENT_MARKS.map(({ logo, label }) => (
                <li key={logo} className="pge-pay__chip">
                  {label}
                </li>
              ))}
            </ul>
            <span className="pge-pay__fine">{EXIT_COPY.offer.fineprint}</span>
          </div>
        </section>

        <div className="pge-leave">
          {leaveHref ? (
            <Link
              href={leaveHref}
              prefetch={false}
              className="pge-leave__link"
              onClick={leaveByLink}
            >
              {EXIT_COPY.leave[stage]}
            </Link>
          ) : (
            <button type="button" className="pge-leave__link" onClick={leave}>
              {EXIT_COPY.leave[stage]}
            </button>
          )}
        </div>

        <div className="pge-sticky">
          {checkout.error && checkout.errorPlace === "sticky" ? (
            <p className="pge-sticky__error" role="alert">
              {checkout.error}
            </p>
          ) : null}
          <button
            type="button"
            className="pge-sticky__cta"
            disabled={checkout.busy}
            aria-busy={checkout.busy}
            onClick={() => unlock("sticky")}
          >
            {EXIT_COPY.sticky.cta(offer.priceCents)}
          </button>
          <span className="pge-sticky__line">
            {EXIT_COPY.sticky.guarantee(guaranteeDays)} ·{" "}
            {full ? (
              <span className="pge-sticky__credit">{EXIT_COPY.sticky.full(creditCents)}</span>
            ) : (
              EXIT_COPY.sticky.pre
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PaygateExitPage;
