import { ImageResponse } from "next/og";
import { MIRA_IMAGE_ALT } from "@features/mira/link-preview";

export const alt = MIRA_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Mira's link preview image, in LoveIQ's colors: the `ap` tokens of tailwind.config.js and the
 * brand gradient of app/globals.css (--gradient-brand). No photo. Built once, at build time.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        padding: "72px 88px 64px",
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#795fc8" }}>LoveIQ</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 168, fontWeight: 700, color: "#161021" }}>
          Mira
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 50, color: "#3f3a4d" }}>
          Your AI coach for body confidence in sex
        </div>
      </div>
      <div
        style={{
          display: "flex",
          height: 16,
          borderRadius: 8,
          background: "linear-gradient(120deg, #fe6839 0%, #ff7f3e 40%, #ff9450 70%, #c36ddf 100%)",
        }}
      />
    </div>,
    size
  );
}
