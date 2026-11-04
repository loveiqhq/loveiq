import type { FC } from "react";
import { PAYMENT_MARKS } from "./paymentMarks";
import "./payment-logos.css";

/**
 * The payment methods a buyer can pick at checkout, as their official logos: one row, the same
 * everywhere a price is asked (the EUR 1.99 page, the plan picker and both exit pages). Marcus,
 * sync 29.10: the official logos convert better, and they should never differ between pages.
 * The artwork is Figma's "Payment Icons" library (LoveIQ file, 11482:1487).
 */
export const PaymentLogos: FC<{ className?: string }> = ({ className }) => (
  <ul
    className={className ? `pay-logos ${className}` : "pay-logos"}
    aria-label="Accepted payment methods"
  >
    {PAYMENT_MARKS.map(({ logo, label }) => (
      <li key={logo} className="pay-logos__item">
        <span
          className={`pay-logos__mark pay-logos__mark--${logo}`}
          role="img"
          aria-label={label}
        />
      </li>
    ))}
  </ul>
);
