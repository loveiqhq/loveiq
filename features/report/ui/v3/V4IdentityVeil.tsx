import Image from "next/image";
import type { FC } from "react";
import V4CoreArchetypeHeading from "./V4CoreArchetypeHeading";
import "./identityVeil.css";

/**
 * The Core Archetype card's place while the report is toured before the EUR 1.99 gate (sync
 * 30.10). Who the reader is stays for the gate (Fatih, 30.10): the server sends no card, no
 * Summary and no name, so this draws the card's shape veiled, under the page's own "Core
 * Archetype" heading, with nothing in it to read.
 */
const V4IdentityVeil: FC = () => (
  <div className="rv4-identity-veil" data-testid="identity-veil">
    <V4CoreArchetypeHeading />
    <div className="rv4-identity-veil__card" aria-hidden="true">
      <span className="rv4-identity-veil__name" />
      <span className="rv4-identity-veil__line" />
      <span className="rv4-identity-veil__line rv4-identity-veil__line--short" />
      <span className="rv4-identity-veil__line" />
      <span className="rv4-identity-veil__line rv4-identity-veil__line--short" />
    </div>
    <p className="rv4-identity-veil__note">
      <span className="rv4-identity-veil__lock" aria-hidden="true">
        <Image src="/report/v3/locks/lock-14.svg" alt="" width={14} height={14} unoptimized />
      </span>
      Revealed when you unlock
    </p>
  </div>
);

export default V4IdentityVeil;
