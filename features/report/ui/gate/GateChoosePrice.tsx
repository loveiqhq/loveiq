"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  CHOOSE_PRICE_CUSTOM_MAX_CENTS,
  CHOOSE_PRICE_CUSTOM_MIN_CENTS,
  CHOOSE_PRICE_TILES,
  chosenPriceCents,
  isFreeOwnAmount,
  parseAmountCents,
  type ChoosePriceOption,
  type ChoosePriceTileOption,
} from "@features/report/logic/choosePrice";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import { GATE_CHOOSE_COPY } from "./gateChoosePriceContent";
import { GATE_COPY, euros } from "./gateContent";
import { useExitCloseRequest } from "./useGateBack";
import type {
  GateCtaPlace,
  InitialUnlockCheckoutState,
  InitialUnlockChoice,
} from "./useInitialUnlockCheckout";
import "./gate-choose-price.css";

/** What the reader has picked: a tile, or their own amount as they typed it. */
export interface PriceChoice {
  option: ChoosePriceOption;
  amountText: string;
}

/** The price a choice charges, in cents; null for an own amount that can't be charged. */
export function choiceCents(choice: PriceChoice): number | null {
  return chosenPriceCents(
    choice.option,
    choice.option === "custom" ? parseAmountCents(choice.amountText) : null
  );
}

/**
 * An own amount of EUR 0: the free result, which the "Are you sure?" sheet (GateZeroConfirm) asks
 * about before anything is sent. The page has no EUR 0 tile since 27 Nov.
 */
export function isFreeChoice(choice: PriceChoice): boolean {
  return (
    choice.option === "free" || (choice.option === "custom" && isFreeOwnAmount(choice.amountText))
  );
}

/** The card's button for a choice: the board's "Get my result for free", "Unlock for €6.99"… */
export function choiceCta(choice: PriceChoice): string {
  if (isFreeChoice(choice)) return GATE_CHOOSE_COPY.card.cta.free;
  const cents = choiceCents(choice);
  return cents === null ? GATE_CHOOSE_COPY.card.cta.empty : GATE_CHOOSE_COPY.card.cta.paid(cents);
}

/** The sticky bar's button for a choice, in its "… now" form. */
export function choiceStickyCta(choice: PriceChoice): string {
  if (isFreeChoice(choice)) return GATE_CHOOSE_COPY.sticky.free;
  const cents = choiceCents(choice);
  return cents === null ? GATE_CHOOSE_COPY.sticky.empty : GATE_CHOOSE_COPY.sticky.paid(cents);
}

const CheckMark: FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 12l4 4 10-10"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface GateChoosePriceCardProps {
  gate: InitialUnlockGatePayload;
  choice: PriceChoice;
  onChoice: (choice: PriceChoice) => void;
  onUnlock: (place: GateCtaPlace) => void;
  state: InitialUnlockCheckoutState;
  /** The own amount's field: the buttons focus it while its amount can't be charged. */
  amountRef: RefObject<HTMLInputElement | null>;
}

/**
 * The board's card, in today's card's frame (GatePriceCard: the badge, the guarantee and the
 * four lines stay): "Pay what is fair to you, choose a price.", four tiles in a 2 × 2 grid (EUR
 * 1.99 if money is tight, 6.99 recommended and picked as the page opens, 19.99, and the reader's
 * own amount, a field in the fourth), and the button, which follows the pick. The tiles are
 * radios, so arrows move between them as in any radio group; the own amount's field picks its
 * tile as it is focused. An own amount of EUR 0 is no error: its button opens the "Are you
 * sure?" sheet (GateZeroConfirm).
 */
export const GateChoosePriceCard: FC<GateChoosePriceCardProps> = ({
  gate,
  choice,
  onChoice,
  onUnlock,
  state,
  amountRef,
}) => {
  const name = useId();
  const hintId = useId();
  const busy = state.status === "redirecting";
  const failed = state.status === "error" && state.place === "card" ? state.message : null;
  const custom = choice.option === "custom";
  const typed = choice.amountText.trim() !== "";
  // A typed amount that can't be charged says why; an empty field only asks for one (the CTA),
  // and EUR 0 is the free result, asked about in the sheet.
  const outOfRange = custom && typed && choiceCents(choice) === null && !isFreeChoice(choice);
  const copy = GATE_CHOOSE_COPY.card;
  const pick = (option: ChoosePriceOption) => onChoice({ ...choice, option });
  // Arrows through the group (a keyboard, a screen reader) stay in it: only a click or a tap on
  // the own amount's words moves the focus into its field.
  const viaKeys = useRef(false);

  return (
    <article className="rpg-card rpg-card--hero iug-card iug-card--choose">
      <span className="rpg-card__badge iug-card__badge">{GATE_COPY.card.badge}</span>

      <div className="rpg-card__head">
        <h2 className="rpg-card__title iug-card__title iug-choose__title">
          <span className="rpg-card__lead">
            {copy.title.lead}
            <em className="iug-choose__fair">{copy.title.emph}</em>
            {copy.title.tail}
          </span>
        </h2>
      </div>

      <fieldset
        className="iug-choose__grid"
        onKeyDown={() => (viaKeys.current = true)}
        onPointerDown={() => (viaKeys.current = false)}
      >
        <legend className="iug-sr-only">{copy.group}</legend>
        {CHOOSE_PRICE_TILES.map((tile) => {
          const checked = choice.option === tile.option;
          return (
            <label
              key={tile.option}
              className={`iug-choose__tile${checked ? " is-checked" : ""}`}
              data-option={tile.option}
            >
              <input
                type="radio"
                name={name}
                className="iug-sr-only"
                checked={checked}
                onChange={() => pick(tile.option)}
              />
              <span className="iug-choose__price">{euros(tile.cents)}</span>
              <span className="iug-choose__note">{copy.notes[tile.option]}</span>
              <span className="iug-choose__mark" aria-hidden="true">
                {checked ? <CheckMark /> : null}
              </span>
            </label>
          );
        })}
        {/* The fourth tile: its words pick it (and land in its field), and so does the field. */}
        <div
          className={`iug-choose__tile iug-choose__own${custom ? " is-checked" : ""}`}
          data-option="custom"
        >
          <label className="iug-choose__note iug-choose__own-label">
            <input
              type="radio"
              name={name}
              className="iug-sr-only"
              checked={custom}
              onChange={() => {
                pick("custom");
                if (!viaKeys.current) amountRef.current?.focus();
              }}
            />
            {copy.own}
          </label>
          <span className="iug-choose__field">
            <span className="iug-choose__euro" aria-hidden="true">
              €
            </span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="iug-choose__input"
              placeholder={copy.ownPlaceholder}
              aria-label={copy.ownAria}
              aria-invalid={outOfRange || undefined}
              aria-describedby={outOfRange ? hintId : undefined}
              value={choice.amountText}
              onFocus={() => {
                if (!custom) pick("custom");
              }}
              onChange={(event) => onChoice({ option: "custom", amountText: event.target.value })}
            />
          </span>
        </div>
      </fieldset>
      {outOfRange ? (
        <p id={hintId} className="iug-choose__hint" role="status">
          {copy.ownRange(CHOOSE_PRICE_CUSTOM_MIN_CENTS, CHOOSE_PRICE_CUSTOM_MAX_CENTS)}
        </p>
      ) : null}

      <button
        type="button"
        className="rpg-card__cta rpg-card__cta--filled iug-choose__cta"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => onUnlock("card")}
      >
        <span>
          {choiceCta(choice)}
          <span aria-hidden="true">{"  →"}</span>
        </span>
      </button>
      <p role="status" className="iug-sr-only">
        {busy && state.place === "card"
          ? choice.option === "free"
            ? GATE_CHOOSE_COPY.checkout.opening
            : GATE_COPY.checkout.starting
          : ""}
      </p>
      {failed ? (
        <p role="alert" className="iug-card__error">
          {failed}
        </p>
      ) : null}

      <div className="rpg-card__details">
        <p className="rpg-card__guarantee iug-card__guarantee">
          <Image
            src="/report/paygate/shield.svg"
            alt=""
            width={15}
            height={15}
            unoptimized
            aria-hidden="true"
          />
          {GATE_COPY.card.guarantee(gate.guaranteeDays)}
        </p>
        <ul className="rpg-card__features">
          {[copy.oneTime, ...GATE_COPY.card.features(gate.creditCents)].map((feature, index) => (
            <li
              key={feature.text}
              className="rpg-card__feature iug-card__feature"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <Image
                src="/report/paygate/check.svg"
                alt=""
                width={16}
                height={16}
                unoptimized
                aria-hidden="true"
              />
              <span>
                {feature.strong ? (
                  <strong className="iug-card__feature-strong">{feature.strong}</strong>
                ) : null}
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
};

const HeartIcon: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
      stroke="#e45a86"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SparkIcon: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"
      stroke="#6a5ef0"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The income guide, in the box under the card and in the "Are you sure?" sheet. */
const FairGuide: FC = () => {
  const guide = GATE_CHOOSE_COPY.why.guide;
  return (
    // The box draws the frame: a table's own border leaves its caption outside.
    <div className="iug-why-choose__guide">
      <table>
        <caption className="iug-why-choose__caption">{guide.caption}</caption>
        <tbody>
          {guide.rows.map((row) => (
            <tr key={row.income} className={row.highlight ? "is-highlight" : undefined}>
              <th scope="row">{row.income}</th>
              <td>{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * The board's box under the card: "Why you choose the price", its lead in violet italics, three
 * reasons in one white card (a heart, the EUR 1.99 mark, EUR 0's before 27 Nov, and a spark:
 * Mark's pick "A", then his "revert to the icons before", 24 Nov) and the income guide, its top
 * band shaded.
 */
export const GateWhyChoose: FC = () => {
  const titleId = useId();
  const copy = GATE_CHOOSE_COPY.why;
  const marks = [
    <span key="heart" className="iug-why-choose__icon iug-why-choose__icon--heart">
      <HeartIcon />
    </span>,
    <span key="low" className="iug-why-choose__icon iug-why-choose__icon--low">
      {copy.lowMark}
    </span>,
    <span key="spark" className="iug-why-choose__icon iug-why-choose__icon--spark">
      <SparkIcon />
    </span>,
  ];
  return (
    <section className="iug-why-choose" aria-labelledby={titleId}>
      <h3 id={titleId} className="iug-why-choose__title">
        {copy.title}
      </h3>
      <p className="iug-why-choose__lead">{copy.lead}</p>
      <ul className="iug-why-choose__rows">
        {copy.rows.map((row, i) => (
          <li key={row.strong} className="iug-why-choose__row">
            <span aria-hidden="true">{marks[i]}</span>
            <span>
              <strong>{row.strong}</strong>
              {row.text}
            </span>
          </li>
        ))}
      </ul>
      <FairGuide />
    </section>
  );
};

/** The tiles' prices in the sheet, EUR 6.99 picked as it opens (the board's). */
const ZERO_SHEET_DEFAULT: ChoosePriceTileOption = "fair";

interface GateZeroConfirmProps {
  state: InitialUnlockCheckoutState;
  /** A price or "Yes, continue for free": the pick, sent as it is pressed. */
  onChoose: (pick: InitialUnlockChoice) => void;
  /** Its handle, the page behind it, Escape, a phone's back or a browser's Back. */
  onClose: () => void;
}

/**
 * The board "Custom €0,00 · Are you sure?" (Marcus's hotfix, 27 Nov 2026): a sheet from the
 * bottom of the screen when the reader asks for their result with an own amount of EUR 0. It
 * says EUR 0 means free, why a payment helps and the fair guide, offers the three tiles' prices
 * (EUR 6.99 picked) with a button that follows them, and takes EUR 0 only from "Yes, continue
 * for free".
 *
 * A dialog over the page, which InitialUnlockGate makes inert while it is up: the focus moves
 * in, stays in, and goes back to the button that opened it. It adds no history entry, so the
 * gate's own Back catch (useGateBack) stays as it was:
 * - Escape, its handle and the page behind it close it;
 * - a phone's back is a close request of its own, as on the exit page (useExitCloseRequest);
 * - a browser's Back still opens the exit page, and the sheet closes as it does (`popstate`).
 */
export const GateZeroConfirm: FC<GateZeroConfirmProps> = ({ state, onChoose, onClose }) => {
  const titleId = useId();
  const copy = GATE_CHOOSE_COPY.zero;
  const [option, setOption] = useState<ChoosePriceTileOption>(ZERO_SHEET_DEFAULT);
  const [sent, setSent] = useState<"free" | "paid" | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const busy = state.status === "redirecting";
  // Only its own buttons' failures: one the card's button met before it opened stays there.
  const failed = state.status === "error" && sent ? state.message : null;
  const cents = CHOOSE_PRICE_TILES.find((tile) => tile.option === option)?.cents ?? 0;

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // The body holds still under it, through the one shared lock the report's layers use.
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // The focus moves in as it opens, onto the dialog itself, so its name is read first.
  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, []);

  // A browser's Back opens the gate's exit page (useGateBack), which hides the gate: the sheet
  // goes with it rather than waiting under the exit page.
  useEffect(() => {
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useExitCloseRequest(true, onClose);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      // Cancelled, so the browser makes no close request of it: the sheet is gone by the time
      // one would land, and the gate's own watcher (useGateBack) would open the exit page. The
      // key goes on to the window, where useGateBack cancels it too.
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    // The page behind is inert; Tab and Shift+Tab go round the sheet's own controls.
    const focusable = Array.from(
      sheetRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === sheetRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="iug-zero">
      <div className="iug-zero__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={sheetRef}
        className="iug-zero__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-lenis-prevent=""
      >
        <button
          type="button"
          className="iug-zero__handle"
          aria-label={copy.close}
          onClick={onClose}
        >
          <span aria-hidden="true" />
        </button>
        <h2 id={titleId} className="iug-zero__title">
          {copy.title.lead}
          <em className="iug-choose__fair">{copy.title.amount}</em>
          {copy.title.tail}
        </h2>
        <p className="iug-zero__body">{copy.body}</p>
        <p className="iug-zero__point">
          <span className="iug-zero__dot" aria-hidden="true" />
          <span>
            <strong>{copy.point.strong}</strong>
            {copy.point.text}
          </span>
        </p>
        <FairGuide />
        <div className="iug-zero__prices" role="group" aria-label={copy.prices}>
          {CHOOSE_PRICE_TILES.map((tile) => (
            <button
              key={tile.option}
              type="button"
              className="iug-zero__price"
              aria-pressed={tile.option === option}
              disabled={busy}
              onClick={() => setOption(tile.option)}
            >
              {euros(tile.cents)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rpg-card__cta rpg-card__cta--filled iug-zero__cta"
          disabled={busy}
          aria-busy={(busy && sent === "paid") || undefined}
          onClick={() => {
            setSent("paid");
            onChoose({ option, cents });
          }}
        >
          {copy.cta(cents)}
        </button>
        <button
          type="button"
          className="iug-zero__free"
          disabled={busy}
          aria-busy={(busy && sent === "free") || undefined}
          onClick={() => {
            setSent("free");
            onChoose({ option: "free", cents: 0 });
          }}
        >
          {copy.free}
        </button>
        <p role="status" className="iug-sr-only">
          {busy
            ? sent === "free"
              ? GATE_CHOOSE_COPY.checkout.opening
              : GATE_COPY.checkout.starting
            : ""}
        </p>
        {failed ? (
          <p role="alert" className="iug-zero__error">
            {failed}
          </p>
        ) : null}
      </div>
    </div>
  );
};
