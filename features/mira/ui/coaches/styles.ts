/**
 * The coaches' shared classes, in the calm chat's language (MiraShell's ink PrimaryButton, the
 * chat's quiet pills). A plain module, so the guide's server-rendered page can use them too.
 */
export const FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple";
export const INK_PILL = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-ap-ink px-6 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-ap-ink/90 active:scale-[0.98] ${FOCUS}`;
export const QUIET_PILL = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-ap-line bg-white px-4 text-[14px] font-semibold text-ap-ink transition-[background-color,border-color,transform] hover:border-ap-mist hover:bg-ap-ground active:scale-[0.98] ${FOCUS}`;
