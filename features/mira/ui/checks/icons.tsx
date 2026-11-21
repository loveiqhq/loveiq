import type { CheckId } from "@features/mira/content/checks";

/** A check's quiet line icon on its soft tile: a wave, a rising sun, two people, a heart. */
const PATHS: Record<CheckId | "body", string> = {
  anxiety: "M3 12c1.5-3.5 3.5-3.5 5 0s3.5 3.5 5 0 3.5-3.5 5 0 2 2.5 3 2.5",
  mood: "M4 17h16M7.5 17a4.5 4.5 0 0 1 9 0M12 7v2M6.2 10.2l1.4 1.4M17.8 10.2l-1.4 1.4",
  loneliness:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M16.5 11a2.5 2.5 0 1 0 0-5M18 14.2c1.5.7 2.5 2.4 2.8 4.8",
  body: "M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4Z",
};

export function CheckIcon({ id, size = 40 }: { id: CheckId | "body"; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[12px] bg-ap-ground text-ap-purple ring-1 ring-inset ring-ap-line"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={PATHS[id]} />
      </svg>
    </span>
  );
}

/** The LoveIQ result's tile: the brand gradient of board 08b. */
export function LoveIqTile({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-[12px] bg-[linear-gradient(135deg,#fe6839_0%,#bf66d9_71.4%)]"
      style={{ width: size, height: size }}
    />
  );
}
