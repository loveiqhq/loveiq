import Image from "next/image";
import type { FC } from "react";

type MarkProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export const LoveIQMark: FC<MarkProps> = ({
  className = "",
  width = 32,
  height = 28,
  priority,
}) => (
  <Image
    src="/images/loveiq-mark.svg"
    alt=""
    width={width}
    height={height}
    unoptimized
    priority={priority}
    className={className}
  />
);

type WordmarkProps = {
  className?: string;
};

export const LoveIQWordmark: FC<WordmarkProps> = ({ className = "" }) => (
  <span className={`font-serif font-bold leading-none ${className}`} aria-label="LoveIQ">
    <span aria-hidden="true" className="text-white">
      Love
    </span>
    <span
      aria-hidden="true"
      className="bg-[linear-gradient(105deg,#D05976_20.51%,#C167CF_48.14%,#8887F6_79.16%)] bg-clip-text text-transparent"
    >
      IQ
    </span>
  </span>
);

type LockupProps = {
  className?: string;
  wordmarkClassName?: string;
  iconClassName?: string;
  iconWidth?: number;
  iconHeight?: number;
  priority?: boolean;
};

export const LoveIQLockup: FC<LockupProps> = ({
  className = "",
  wordmarkClassName = "text-xl",
  iconClassName = "h-7 w-8",
  iconWidth = 32,
  iconHeight = 28,
  priority,
}) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <LoveIQMark
      className={iconClassName}
      width={iconWidth}
      height={iconHeight}
      priority={priority}
    />
    <LoveIQWordmark className={wordmarkClassName} />
  </span>
);
