"use client";

import { useState, useEffect, type FC } from "react";
import type { ChapterIntro } from "@/data/survey-data";

interface GuideAvatarProps {
  chapterIntro: ChapterIntro | null;
  onDismiss: () => void;
}

const GuideAvatar: FC<GuideAvatarProps> = ({ chapterIntro, onDismiss }) => {
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (!chapterIntro) return;
    // Slight delay so the animation plays
    const t = setTimeout(() => setShowPopup(true), 400);
    return () => {
      clearTimeout(t);
      setShowPopup(false);
    };
  }, [chapterIntro]);

  const handleDismiss = () => {
    setShowPopup(false);
    setTimeout(onDismiss, 250);
  };

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end">
      {/* Chapter intro popup — floats above the orb */}
      {showPopup && chapterIntro && (
        <div
          className="relative mb-4 w-[calc(100vw-4rem)] max-w-[360px] rounded-2xl border border-white/10 bg-[#13091c]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{
            animation: "survey-scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          {/* Chapter badge */}
          <span className="mb-3 inline-block rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)] px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#a78bfa]">
            {chapterIntro.chapter}
          </span>

          <p className="mb-4 font-sans text-[14px] leading-relaxed text-white/80">
            {chapterIntro.text}
          </p>

          <button
            type="button"
            onClick={handleDismiss}
            className="font-sans text-[14px] font-semibold text-[#a78bfa] transition hover:text-[#c4b5fd]"
          >
            Got it
          </button>

          {/* Pointer triangle — points down toward the orb */}
          <div className="absolute -bottom-2 right-5">
            <div className="h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#13091c]/95" />
          </div>
        </div>
      )}

      {/* Orb */}
      <button
        type="button"
        aria-label="Guide avatar"
        onClick={() => {
          if (chapterIntro && !showPopup) {
            setShowPopup(true);
          }
        }}
        className="h-14 w-14 rounded-full bg-gradient-to-br from-[#fe6839] to-[#a78bfa]"
        style={{
          animation: "survey-avatar-pulse 3s ease-in-out infinite",
        }}
      />
    </div>
  );
};

export default GuideAvatar;
