import type { SVGProps } from "react";

export default function CoreOrientationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 30 30" fill="none" aria-hidden="true" {...props}>
      <circle cx="15" cy="15" r="14" stroke="currentColor" strokeWidth="2" />
      <circle cx="15" cy="15" r="7" fill="currentColor" />
    </svg>
  );
}
