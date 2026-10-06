import { preload } from "react-dom";

/**
 * Report 3.0 is set in Plus Jakarta Sans (app/fonts.css), so its latin file comes with the
 * report page, as the root layout's Manrope and Lora files come with every page. Only here:
 * a page that never uses a preloaded font gets a console warning for it.
 */
export function preloadReportFont(): void {
  preload("/fonts/plus-jakarta-sans-latin.cd8db90c.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "",
  });
}
